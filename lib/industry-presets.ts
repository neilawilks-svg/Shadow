export interface IndustryPreset {
  id: string;
  label: string;
  agenda: string;
  topics: string[];
  packetPath: string;
  sourceLinks: Array<{ label: string; url: string }>;
}

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: "healthcare-provider",
    label: "Healthcare Provider Network",
    agenda:
      "Assess a systemwide OpenAI-enabled clinical operations assistant for documentation, triage support, and patient communication.",
    topics: [
      "clinical safety and oversight",
      "HIPAA/privacy and cyber resilience",
      "care team adoption and workflow impact",
      "measurable quality and throughput outcomes",
    ],
    packetPath: "/data/industry-agenda-packets/healthcare-provider-openai-shadow-board.md",
    sourceLinks: [
      {
        label: "FDA AI/ML-enabled medical devices list",
        url: "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-and-machine-learning-aiml-enabled-medical-devices",
      },
      {
        label: "HHS OCR breach portal",
        url: "https://ocrportal.hhs.gov/ocr/breach/breach_report.jsf",
      },
      {
        label: "NIST AI RMF 1.0",
        url: "https://www.nist.gov/itl/ai-risk-management-framework",
      },
    ],
  },
  {
    id: "financial-services",
    label: "Financial Services Institution",
    agenda:
      "Evaluate deploying OpenAI agents for client servicing, operations co-pilots, and compliance workflow acceleration.",
    topics: [
      "model risk and governance controls",
      "cybersecurity and incident disclosure readiness",
      "fraud and operational resilience",
      "business value versus control overhead",
    ],
    packetPath: "/data/industry-agenda-packets/financial-services-openai-shadow-board.md",
    sourceLinks: [
      {
        label: "OCC Semiannual Risk Perspective",
        url: "https://www.occ.treas.gov/publications-and-resources/publications/semiannual-risk-perspective/index-semiannual-risk-perspective.html",
      },
      {
        label: "SEC Cybersecurity Risk Management Rule",
        url: "https://www.sec.gov/newsroom/press-releases/2023-139",
      },
      {
        label: "NIST AI RMF 1.0",
        url: "https://www.nist.gov/itl/ai-risk-management-framework",
      },
    ],
  },
  {
    id: "retail-commerce",
    label: "Retail and E-Commerce",
    agenda:
      "Decide whether to launch OpenAI-powered merchandising, customer support, and pricing assistants before peak season.",
    topics: [
      "conversion lift and customer trust",
      "payment and data security",
      "operating margin impact",
      "store and contact-center adoption",
    ],
    packetPath: "/data/industry-agenda-packets/retail-commerce-openai-shadow-board.md",
    sourceLinks: [
      {
        label: "U.S. Census Quarterly Retail E-Commerce",
        url: "https://www.census.gov/retail/ecommerce.html",
      },
      {
        label: "PCI DSS 4.0 Resources",
        url: "https://www.pcisecuritystandards.org/standards/pci-dss/",
      },
      {
        label: "NIST GenAI Profile",
        url: "https://www.nist.gov/itl/ai-risk-management-framework/generative-ai-profile",
      },
    ],
  },
];
