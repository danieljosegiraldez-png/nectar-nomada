# Coffee and cacao research packet

Start with the [complete research manual](COFFEE_CACAO_RESEARCH_MANUAL.md). It connects study evidence, experimental design, observation, harvest and interpretation, and includes the original coffee field protocol.

- [40-record evidence catalogue](STUDY_EVIDENCE_CATALOGUE.md): published methods, findings, extracted analyses, implications and source links.
- [Search and evidence audit](SEARCH_AND_EVIDENCE_AUDIT.md): scope, access limits, dating, possible overlapping datasets and further extraction.
- [Equipment and consumables](EQUIPMENT_AND_CONSUMABLES.md): 34 requirements with pilot quantities or explicit unknowns; no unverified seller claims.
- [Field forms](FIELD_FORMS.md): allocation, net integrity, visits, video, specimens, harvest, labour and conclusions.
- [Software requirements](RESEARCH_SOFTWARE_REQUIREMENTS.md): research entities, permissions, validation and acceptance tests.
- [Import bundle](research_reference_bundle.json) and [JSON Schema](research-reference.schema.json): 40 study records, eight proposed local workflows and 34 inventory requirements.

This is a practical evidence map, not an exhaustive systematic review or completed field experiment. Abstract-only findings and incompletely extracted methods are marked. Published gear is not invented where a source does not identify it. Proposed pilot quantities are not powered study sample sizes. The remaining local choices include crop/genotype, bee species, site replication, net qualification and optical validation, particularly for tiny cacao visitors.

Run `python3 tools/verify_research.py` from the parent packet folder for structural and cross-reference checks plus negative test cases. This checks the subset of JSON Schema keywords used here, not general standards conformance or scientific validity. Platform and field workflow acceptance tests remain implementation requirements.
