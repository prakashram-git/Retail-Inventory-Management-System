import type { UserRole } from "@/lib/types/domain";

export type TourPlacement = "top" | "bottom" | "left" | "right";
export type ExpectedAction = "click" | "input" | "scan" | "observe";

export interface HelpStep {
  step_number: number;
  title: string;
  description: string;
  /** CSS selector, always a resilient `[data-tour="..."]` attribute selector. */
  target_selector: string;
  placement: TourPlacement;
  desktop_image_url: string | null;
  mobile_image_url: string | null;
  expected_action: ExpectedAction;
}

export interface HelpCategory {
  id: string;
  title: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface HelpWorkflow {
  id: string;
  category_id: string;
  title: string;
  summary: string;
  allowed_roles: UserRole[];
  target_route: string | null;
  estimated_time_min: number;
  steps: HelpStep[];
  version: string;
  feature_hash: string;
  drift_detected: boolean;
  updated_at?: string;
}

export interface HelpProgress {
  workflow_id: string;
  completed: boolean;
  last_step_index: number;
  feedback_rating: number | null;
}

/** What the client needs: workflows plus their category titles. */
export interface HelpPayload {
  categories: HelpCategory[];
  workflows: HelpWorkflow[];
}
