"""Validate this packet's schema subset and cross-references, not a general validator."""
import copy
import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research'
SCHEMA = json.loads((RESEARCH / 'research-reference.schema.json').read_text())


def check(value, spec, path='$'):
    if '$ref' in spec:
        target = SCHEMA
        assert spec['$ref'].startswith('#/'), 'Only local references supported'
        for part in spec['$ref'][2:].split('/'):
            target = target[part.replace('~1', '/').replace('~0', '~')]
        check(value, target, path)
        return
    if 'const' in spec:
        assert type(value) is type(spec['const']) and value == spec['const'], path
    types = spec.get('type', [])
    types = [types] if isinstance(types, str) else types
    matches = {
        'null': value is None,
        'string': isinstance(value, str),
        'boolean': isinstance(value, bool),
        'integer': isinstance(value, int) and not isinstance(value, bool),
        'number': isinstance(value, (int, float)) and not isinstance(value, bool),
        'array': isinstance(value, list),
        'object': isinstance(value, dict),
    }
    assert not types or any(matches[t] for t in types), path + ': wrong type'
    if isinstance(value, dict):
        assert set(spec.get('required', [])) <= set(value), path + ': missing property'
        props = spec.get('properties', {})
        if spec.get('additionalProperties') is False:
            assert set(value) <= set(props), path + ': unexpected property'
        for key, child in value.items():
            if key in props:
                check(child, props[key], path + '.' + key)
    if isinstance(value, list) and 'items' in spec:
        for i, child in enumerate(value):
            check(child, spec['items'], '%s[%s]' % (path, i))
    if isinstance(value, str):
        assert len(value) >= spec.get('minLength', 0), path + ': empty string'
        if 'pattern' in spec:
            assert re.search(spec['pattern'], value), path + ': pattern mismatch'
    if isinstance(value, (float, int)) and not isinstance(value, bool):
        if 'minimum' in spec:
            assert value >= spec['minimum'], path + ': below minimum'


def validate(bundle):
    check(bundle, SCHEMA)
    datetime.date.fromisoformat(bundle['checked_on'])
    ids = {}
    for group in ('studies', 'methods', 'items'):
        rows = bundle[group]
        ids[group] = {row['id'] for row in rows}
        assert len(ids[group]) == len(rows), group + ': duplicate ID'
    for row in bundle['studies']:
        assert row['source_url'].startswith('https://'), row['id'] + ': source URL'
        datetime.date.fromisoformat(row['checked_on'])
    for row in bundle['methods']:
        assert set(row['study_ids']) <= ids['studies'], row['id'] + ': unknown study'
        assert set(row['inventory_ids']) <= ids['items'], row['id'] + ': unknown item'
    for row in bundle['items']:
        assert set(row['method_ids']) <= ids['methods'], row['id'] + ': unknown method'


def main():
    bundle = json.loads((RESEARCH / 'research_reference_bundle.json').read_text())
    validate(bundle)
    for group, filename, key in (
        ('studies', 'study_registry.json', 'studies'),
        ('methods', 'method_catalogue.json', 'methods'),
        ('items', 'equipment_consumables_catalogue.json', 'items'),
    ):
        assert bundle[group] == json.loads((RESEARCH / filename).read_text())[key], filename
    assert [len(bundle[k]) for k in ('studies', 'methods', 'items')] == [40, 8, 34]
    def reject(label, mutate):
        bad = copy.deepcopy(bundle)
        mutate(bad)
        try:
            validate(bad)
        except (AssertionError, ValueError):
            print('PASS rejection:', label)
        else:
            raise AssertionError('Invalid data accepted: ' + label)
    reject('dangling study', lambda b: b['methods'][0]['study_ids'].append('UNKNOWN'))
    reject('dangling inventory', lambda b: b['methods'][0]['inventory_ids'].append('UNKNOWN'))
    reject('dangling method', lambda b: b['items'][0]['method_ids'].append('UNKNOWN'))
    reject('missing provenance', lambda b: b['studies'][0].pop('source_url'))
    reject('negative quantity', lambda b: b['items'][0].update(pilot_quantity=-1))
    reject('boolean quantity', lambda b: b['items'][0].update(pilot_quantity=True))
    reject('duplicate ID', lambda b: b['studies'].append(b['studies'][0]))
    reject('unexpected property', lambda b: b['items'][0].update(invented_price=1))
    reject('invalid date', lambda b: b.update(checked_on='2026-02-30'))
    nullable = copy.deepcopy(bundle)
    nullable['items'][0]['pilot_quantity'] = None
    validate(nullable)
    print('PASS: unknown quantity remains null; 40 studies, 8 methods, 34 items; standalone catalogues match bundle.')
    print('Scope: delivered schema keyword subset, dates, identifiers and foreign keys. No general JSON Schema conformance claim, source re-analysis, UI test or field validation.')


if __name__ == '__main__':
    main()
