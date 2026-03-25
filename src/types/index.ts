// Types for cloud providers
export type CloudProvider =
  | 'aws'
  | 'gcp'
  | 'azure'
  | 'firebase'
  | 'heroku'
  | 'digitalocean'
  | 'vercel'
  | 'netlify'
  | 'generic';

// Types for detected cloud services
export type CloudService =
  | 'aws-lambda'
  | 'aws-s3'
  | 'aws-rds'
  | 'aws-dynamodb'
  | 'aws-api-gateway'
  | 'aws-iam'
  | 'gcp-cloud-run'
  | 'gcp-app-engine'
  | 'gcp-firestore'
  | 'gcp-cloud-storage'
  | 'azure-app-service'
  | 'azure-cosmos-db'
  | 'firebase-firestore'
  | 'firebase-functions'
  | 'heroku-dyno';

export interface Repository {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  language: string;
}

export interface AnalysisResult {
  repository: Repository;
  detectedServices: DetectedService[];
  setupOrder: CloudService[];
  analysisDate: string;
  dependencies: string[];
  codePatterns: CodePattern[];
  techStack?: string[];
}

export interface DetectedService {
  service: CloudService;
  confidence: number; // 0-1
  evidence: string[];
  setupSteps?: SetupStep[];
}

export interface CodePattern {
  pattern: string;
  service: CloudService;
  location?: string;
}

export interface SetupStep {
  order: number;
  title: string;
  description: string;
  fieldName: string;
  suggestedValue?: string | number | boolean;
  helpText: string;
}

export interface CloudServiceConfig {
  service: CloudService;
  smartDefaults: Record<string, string | number | boolean>;
  requiredFields: string[];
  optionalFields: string[];
  documentationUrl: string;
}

export interface PageDetectionResult {
  currentPage: string;
  cloudPlatform: string;
  pageType: string;
  suggestedService?: CloudService;
}

export interface GuidanceMessage {
  type: 'tip' | 'warning' | 'success' | 'info';
  title: string;
  message: string;
  fieldName?: string;
  suggestedValue?: string;
}

// ============== New Types for Enhanced Features ==============

// URL Extraction & Validation
export interface ExtractedRepoInfo {
  owner: string;
  repo: string;
  url: string;
  isValid: boolean;
  error?: string;
}

// User Action Tracking
export type ActionType =
  | 'page_navigation'
  | 'form_field_interaction'
  | 'button_click'
  | 'deployment_step_completed'
  | 'guidance_viewed'
  | 'video_played'
  | 'tooltip_shown';

export interface UserAction {
  id: string;
  type: ActionType;
  timestamp: number;
  details: Record<string, any>;
  pageContext?: {
    url: string;
    service?: string;
  };
}

export interface ActionHistory {
  sessionId: string;
  startTime: number;
  endTime?: number;
  actions: UserAction[];
}

export interface ActionStats {
  totalActions: number;
  actionsByType: Partial<Record<ActionType, number>>;
  stepsCompleted: number;
  timeSpent: number;
  lastAction?: UserAction;
}

// Deployment Progress Tracking
export interface DeploymentStep {
  id: string;
  name: string;
  description: string;
  serviceType: string;
  estimatedDurationSeconds: number;
  isCompleted: boolean;
  completedAt?: number;
  resourcesCreated?: string[];
  errors?: string[];
}

export interface DeploymentSession {
  id: string;
  repositoryUrl: string;
  detectedServices: string[];
  steps: DeploymentStep[];
  startTime: number;
  endTime?: number;
  totalEstimatedTime: number;
  actualTimeSpent: number;
}

export interface DeploymentMetrics {
  totalSteps: number;
  completedSteps: number;
  progressPercentage: number;
  timeSpent: number;
  estimatedTimeRemaining: number;
  completionRate: number;
}

// Enhanced Guidance Content
export interface FieldGuidance {
  fieldName: string;
  description: string;
  examples: string[];
  validation?: {
    pattern?: string;
    rules?: string[];
  };
  relatedFields?: string[];
  commonMistakes?: string[];
}

export interface ServiceGuidanceContent {
  service: CloudService;
  overview: string;
  stepByStepGuide: {
    title: string;
    description: string;
    videoUrl?: string;
    estimatedTime: number;
    fieldGuidance: FieldGuidance[];
  }[];
  videoTutorials: {
    title: string;
    url: string;
    duration: number;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  }[];
  costEstimation?: {
    baseCost: number;
    costPerUnit: number;
    unit: string;
    freeTier?: boolean;
  };
  commonIssues: {
    issue: string;
    solution: string;
  }[];
}

// Popup UI States
export type PopupStep = 'input' | 'analysis' | 'deployment' | 'tracking';

export interface PopupState {
  currentStep: PopupStep;
  repoInfo?: ExtractedRepoInfo;
  analysisResult?: AnalysisResult;
  deploymentSession?: DeploymentSession;
  deploymentMetrics?: DeploymentMetrics;
  actionHistory?: ActionHistory;
  error?: string;
  loading: boolean;
}

// Message Types for Background Communication
export type MessageType =
  | 'analyze_repository'
  | 'track_action'
  | 'get_action_history'
  | 'update_deployment_progress'
  | 'get_guidance_content'
  | 'extract_page_url';

export interface Message<T = any> {
  type: MessageType;
  payload?: T;
}

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
