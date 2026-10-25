// The "unlock AI" notice shown after a run without AI

export const AI_SECTIONS = [
  { key: "executive_summary", title: "Executive Summary", ai: "plain language overview for leadership" },
  { key: "business_domains", title: "Business Domains", ai: "what the system does for stakeholders" },
  { key: "architecture_overview", title: "Architecture Overview", ai: "deeper narrative for architects" },
  { key: "data_flows", title: "Data Flows", ai: "how information moves through your system" },
  { key: "developer_onboarding", title: "Developer Onboarding", ai: "getting started guide for new hires" },
];

/**
 * Sections the notice can offer to upgrade: the ones that were generated in this run.
 * Their rule-based text exists. The notice never calls a written document "missing".
 * Without a document list (older callers), every AI-capable section is offered.
 */
export function aiUpgradeSections(documents) {
  if (!Array.isArray(documents)) return AI_SECTIONS;
  const written = new Set(documents.filter((doc) => doc && !doc.error).map((doc) => doc.key));
  return AI_SECTIONS.filter((section) => written.has(section.key));
}
