export type Step = {
  id: string;
  name: string;
  model_id: string;
  system_prompt: string;
  input_kind: "image" | "previous_text";
  output_format: "text" | "captions_json";
  step_order?: number;
};
export type Chain = {
  id: string;
  name: string;
  description: string;
  version: number;
  created_at: string;
  prompt_chain_steps: Step[];
};
export type Model = {
  id: string;
  name: string;
  enabled: boolean;
  supports_vision: boolean;
  llm_providers: { name: string; provider_type: string; enabled: boolean };
};
export type Media = {
  id: string;
  request_id: string;
  output_text: string;
  captions: string[];
  chain_version: number;
  created_at: string;
  url: string;
};
