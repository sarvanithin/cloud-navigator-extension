/**
 * Deployment Guide Service - AI-Powered Step Generator
 * Generates intelligent, contextual deployment steps based on services and user choices
 */

import { CloudService, DeploymentStep } from '@/types';
import { chatService, DeploymentContext } from './chatService';

export interface DeploymentInstruction {
  stepId: string;
  title: string;
  description: string;
  service: CloudService;
  actions: BrowserAction[];
  estimatedTime: number; // in seconds
  prerequisites?: string[];
  validation?: {
    checkWhat: string;
    expectedResult: string;
  };
  tips?: string[];
}

export interface BrowserAction {
  type: 'navigate' | 'click' | 'fill' | 'create-file' | 'copy' | 'wait' | 'read';
  target?: string; // URL, selector, filename
  value?: string; // For fill actions
  explanation: string;
  optional?: boolean;
}

// Service-specific templates
const SERVICE_TEMPLATES: Record<CloudService, Partial<DeploymentInstruction>[]> = {
  'aws-lambda': [
    {
      title: 'Create IAM Execution Role',
      description: 'Create an IAM role that Lambda will assume to execute your function',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.aws.amazon.com/iamv2/home#/roles',
          explanation: 'Go to AWS IAM Roles page'
        },
        {
          type: 'click',
          target: 'button:contains("Create role")',
          explanation: 'Click "Create role" button'
        },
        {
          type: 'click',
          target: 'input[value="Lambda"]',
          explanation: 'Select "Lambda" as the trusted entity type'
        },
        {
          type: 'click',
          target: 'button:contains("Next")',
          explanation: 'Click Next to continue'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="role name"]',
          value: 'lambda-execution-role',
          explanation: 'Enter role name: lambda-execution-role'
        },
        {
          type: 'click',
          target: 'button:contains("Create role")',
          explanation: 'Click "Create role" to finish'
        }
      ],
      estimatedTime: 180,
      tips: [
        'The execution role allows Lambda to access other AWS services',
        'Keep the role name simple and descriptive',
        'You can add more permissions later if needed'
      ]
    },
    {
      title: 'Create Lambda Function',
      description: 'Create your Lambda function with the code from your repository',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.aws.amazon.com/lambda/home#/functions',
          explanation: 'Go to AWS Lambda Functions page'
        },
        {
          type: 'click',
          target: 'button:contains("Create function")',
          explanation: 'Click "Create function" button'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Function name"]',
          value: 'my-api-function',
          explanation: 'Enter function name (e.g., my-api-function)'
        },
        {
          type: 'click',
          target: 'select[aria-label*="Runtime"]',
          explanation: 'Select runtime (Node.js 18.x recommended)'
        },
        {
          type: 'click',
          target: 'select[aria-label*="Execution role"]',
          explanation: 'Select the execution role you created earlier'
        },
        {
          type: 'click',
          target: 'button:contains("Create function")',
          explanation: 'Click "Create function"'
        }
      ],
      estimatedTime: 300,
      tips: [
        'Use descriptive function names that indicate what they do',
        'Select the appropriate runtime for your code',
        'The execution role is crucial - make sure to select the one you created'
      ]
    }
  ],
  'aws-s3': [
    {
      title: 'Create S3 Bucket',
      description: 'Create an S3 bucket to store your application data',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.aws.amazon.com/s3/home',
          explanation: 'Go to AWS S3 page'
        },
        {
          type: 'click',
          target: 'button:contains("Create bucket")',
          explanation: 'Click "Create bucket"'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Bucket name"]',
          value: 'my-app-bucket-' + Date.now(),
          explanation: 'Enter a globally unique bucket name (must be unique across all AWS accounts)'
        },
        {
          type: 'click',
          target: 'select[aria-label*="Region"]',
          explanation: 'Select region closest to your users (e.g., us-east-1)'
        },
        {
          type: 'click',
          target: 'button:contains("Create bucket")',
          explanation: 'Click "Create bucket"'
        }
      ],
      estimatedTime: 120,
      tips: [
        'Bucket names must be globally unique and follow DNS naming rules',
        'Choose a region close to your expected users for better latency',
        'You can set up versioning and encryption after creation'
      ]
    }
  ],
  'aws-dynamodb': [
    {
      title: 'Create DynamoDB Table',
      description: 'Create a DynamoDB table for your application data',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.aws.amazon.com/dynamodbv2/home#/tables',
          explanation: 'Go to AWS DynamoDB Tables page'
        },
        {
          type: 'click',
          target: 'button:contains("Create table")',
          explanation: 'Click "Create table"'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Table name"]',
          value: 'my-app-table',
          explanation: 'Enter table name'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Partition key"]',
          value: 'id',
          explanation: 'Enter partition key (e.g., id)'
        },
        {
          type: 'click',
          target: 'button:contains("Create table")',
          explanation: 'Click "Create table"'
        }
      ],
      estimatedTime: 180,
      tips: [
        'Choose your partition key wisely - it determines how data is distributed',
        'You can add more attributes after table creation',
        'DynamoDB charges for read/write capacity or on-demand pricing'
      ]
    }
  ],
  'gcp-cloud-run': [
    {
      title: 'Deploy to Cloud Run',
      description: 'Deploy your containerized application to Google Cloud Run',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.cloud.google.com/run',
          explanation: 'Go to Google Cloud Run page'
        },
        {
          type: 'click',
          target: 'button:contains("Create Service")',
          explanation: 'Click "Create Service"'
        },
        {
          type: 'click',
          target: 'input[value="Deploy one revision from an image repository"]',
          explanation: 'Select "Deploy from Container Image"'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Container image URL"]',
          value: 'gcr.io/my-project/my-image',
          explanation: 'Enter your container image URL'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Service name"]',
          value: 'my-api-service',
          explanation: 'Enter service name'
        },
        {
          type: 'click',
          target: 'button:contains("Deploy")',
          explanation: 'Click "Deploy"'
        }
      ],
      estimatedTime: 300,
      tips: [
        'Make sure your container is uploaded to Container Registry first',
        'Cloud Run automatically scales based on traffic',
        'The first deployment may take a few minutes'
      ]
    }
  ],
  'firebase-firestore': [
    {
      title: 'Create Firestore Database',
      description: 'Create a Firestore database for real-time data storage',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.firebase.google.com/u/0/project/_/firestore',
          explanation: 'Go to Firebase Firestore page'
        },
        {
          type: 'click',
          target: 'button:contains("Create database")',
          explanation: 'Click "Create database"'
        },
        {
          type: 'click',
          target: 'input[value="production"]',
          explanation: 'Select "Production mode" for production use'
        },
        {
          type: 'click',
          target: 'select[aria-label*="location"]',
          explanation: 'Select location (choose closest to your users)'
        },
        {
          type: 'click',
          target: 'button:contains("Create")',
          explanation: 'Click "Create"'
        }
      ],
      estimatedTime: 180,
      tips: [
        'Production mode requires authentication',
        'You can adjust security rules after creation',
        'Firestore has generous free tier for development'
      ]
    }
  ],
  'firebase-functions': [
    {
      title: 'Deploy Firebase Function',
      description: 'Deploy Cloud Functions to Firebase',
      actions: [
        {
          type: 'navigate',
          target: 'https://console.firebase.google.com/u/0/project/_/functions/list',
          explanation: 'Go to Firebase Functions page'
        },
        {
          type: 'click',
          target: 'button:contains("Create Function")',
          explanation: 'Click "Create Function"'
        },
        {
          type: 'fill',
          target: 'input[placeholder*="Function name"]',
          value: 'myFunction',
          explanation: 'Enter function name'
        },
        {
          type: 'click',
          target: 'select[aria-label*="Trigger type"]',
          explanation: 'Select trigger type (HTTP, Cloud Pub/Sub, etc.)'
        },
        {
          type: 'click',
          target: 'button:contains("Create and Deploy")',
          explanation: 'Click "Create and Deploy"'
        }
      ],
      estimatedTime: 240,
      tips: [
        'Choose appropriate trigger for your use case',
        'Initial deployment takes about 1-2 minutes',
        'Monitor logs in the Firebase console'
      ]
    }
  ],
  'azure-app-service': [
    {
      title: 'Create App Service',
      description: 'Create an Azure App Service to host your application',
      actions: [
        {
          type: 'navigate',
          target: 'https://portal.azure.com/#create/Microsoft.AppServiceWeb',
          explanation: 'Go to Azure App Service creation page'
        },
        {
          type: 'fill',
          target: 'input[id*="app-name"]',
          value: 'myapp-' + Date.now(),
          explanation: 'Enter a unique app name'
        },
        {
          type: 'click',
          target: 'select[aria-label*="Resource Group"]',
          explanation: 'Select or create a resource group'
        },
        {
          type: 'click',
          target: 'select[aria-label*="Runtime stack"]',
          explanation: 'Select runtime stack (Node.js, Python, etc.)'
        },
        {
          type: 'click',
          target: 'button:contains("Review + create")',
          explanation: 'Click "Review + create"'
        },
        {
          type: 'click',
          target: 'button:contains("Create")',
          explanation: 'Click "Create"'
        }
      ],
      estimatedTime: 300,
      tips: [
        'App Service automatically handles scaling and patching',
        'Choose the appropriate pricing tier for your needs',
        'Deployment takes about 5-10 minutes'
      ]
    }
  ],
  'aws-rds': [],
  'aws-api-gateway': [],
  'aws-iam': [],
  'gcp-app-engine': [],
  'gcp-firestore': [],
  'gcp-cloud-storage': [],
  'azure-cosmos-db': [],
  'heroku-dyno': []
};

export class DeploymentGuideService {
  /**
   * Generate deployment instructions for detected services
   */
  async generateInstructions(
    services: CloudService[],
    context: DeploymentContext
  ): Promise<DeploymentInstruction[]> {
    const instructions: DeploymentInstruction[] = [];

    for (const service of services) {
      const template = SERVICE_TEMPLATES[service];
      if (template) {
        template.forEach((t, index) => {
          instructions.push({
            stepId: `${service}_${index}`,
            title: t.title || service,
            description: t.description || `Set up ${service}`,
            service,
            actions: t.actions || [],
            estimatedTime: t.estimatedTime || 300,
            prerequisites: t.prerequisites,
            validation: t.validation,
            tips: t.tips
          });
        });
      }
    }

    return instructions;
  }

  /**
   * Get next action for current step
   */
  getNextAction(instruction: DeploymentInstruction, currentActionIndex: number = 0): BrowserAction | null {
    if (currentActionIndex < instruction.actions.length) {
      return instruction.actions[currentActionIndex];
    }
    return null;
  }

  /**
   * Format instruction for display
   */
  formatInstruction(instruction: DeploymentInstruction): string {
    let formatted = `## ${instruction.title}\n\n`;
    formatted += `${instruction.description}\n\n`;
    formatted += `**Estimated Time:** ${Math.round(instruction.estimatedTime / 60)} minutes\n\n`;

    if (instruction.prerequisites && instruction.prerequisites.length > 0) {
      formatted += `**Prerequisites:**\n`;
      instruction.prerequisites.forEach((p) => {
        formatted += `- ${p}\n`;
      });
      formatted += '\n';
    }

    formatted += `**Steps:**\n`;
    instruction.actions.forEach((action, index) => {
      formatted += `${index + 1}. ${action.explanation}\n`;
      if (action.value) {
        formatted += `   Value: \`${action.value}\`\n`;
      }
    });

    if (instruction.tips && instruction.tips.length > 0) {
      formatted += `\n**Tips:**\n`;
      instruction.tips.forEach((tip) => {
        formatted += `- ${tip}\n`;
      });
    }

    return formatted;
  }

  /**
   * Get validation guidance
   */
  getValidationGuidance(instruction: DeploymentInstruction): string | null {
    if (instruction.validation) {
      return `✓ Check: ${instruction.validation.checkWhat}\n✓ Expected: ${instruction.validation.expectedResult}`;
    }
    return null;
  }
}

export const deploymentGuideService = new DeploymentGuideService();
