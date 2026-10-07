import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const data=vi.hoisted(()=>({ measurements: [
  {id:"original",variable:"moisture",value:12,unit:"%",occurredAt:new Date("2026-10-07T12:00Z"),correctsId:null},
  {id:"corrected",variable:"moisture",value:11.5,unit:"%",occurredAt:new Date("2026-10-07T12:00Z"),correctsId:"original"},
]}));
vi.mock("../../lib/auth/session",()=>({getCurrentUser:async()=>({userAccountId:"operator"})}));
vi.mock("next-intl/server",()=>({getTranslations:async()=>(key:string)=>key}));
vi.mock("../../lib/traceability/reports",()=>({getLotReport:async()=>({
 lot:{id:"lot",lotCode:"L-1",lotType:"green",location:null,project:null,organization:null},
 origins:{harvestEvents:[],receivingEvents:[],apiaryHarvestEvents:[]},ancestorLots:[],descendantLots:[],
 measurements:data.measurements,samples:[],sensoryLinkage:{},fermentationRuns:[],dryingRuns:[],storageAssignments:[],assets:[],generatedAt:new Date(),
})}));
vi.mock("../../lib/traceability/quantity",()=>({computeCurrentQuantity:async()=>({quantity:1,unit:"kg"})}));
vi.mock("../../lib/traceability/media",()=>({getSignedUrlForAsset:vi.fn()}));
vi.mock("../../lib/traceability/lots",()=>({TraceabilityAccessError:class extends Error{}}));
vi.mock("../../app/components/traceability/PrintButton",()=>({PrintButton:()=>null}));
const {default:page}=await import("../../app/lots/[id]/report/page");
it("conserva el original y distingue la lectura reemplazada de su corrección en el informe",async()=>{
 const html=renderToStaticMarkup(await page({params:Promise.resolve({id:"lot"})}));
 expect(html).toContain("moisture: 12 %");expect(html).toContain("moisture: 11.5 %");
 const rows=html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
 const original=rows.find((r)=>r.includes("moisture: 12 %"))!;
 const corrected=rows.find((r)=>r.includes("moisture: 11.5 %"))!;
 expect(original).toContain("<strong>supersededLabel</strong>");expect(original).not.toContain("(correctionLabel)");
 expect(corrected).toContain("(correctionLabel)");expect(corrected).not.toContain("supersededLabel");
});
