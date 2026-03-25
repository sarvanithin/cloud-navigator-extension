/**
 * Navigation Assistant Service
 * Provides intelligent navigation guidance with direct links,
 * step-by-step instructions, and real-time page awareness
 */

import { CloudProvider, CloudService } from '../types';

export interface NavigationLink {
  id: string;
  url: string;
  title: string;
  description: string;
  category: 'setup' | 'console' | 'documentation' | 'billing' | 'support' | 'resource';
  provider: CloudProvider;
  service?: CloudService;
  icon?: string;
  requiresAuth: boolean;
  estimatedTime?: string;
  priority: number;
  context?: string[];
  prerequisites?: string[];
}

export interface NavigationStep {
  stepNumber: number;
  action: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'verify';
  title: string;
  description: string;
  url?: string;
  selector?: string;
  value?: string;
  screenshot?: string;
  helpText: string;
  alternativePaths?: NavigationStep[];
  validationCriteria?: string[];
  commonIssues?: string[];
}

export interface NavigationPath {
  id: string;
  goal: string;
  currentUrl: string;
  targetUrl: string;
  steps: NavigationStep[];
  totalSteps: number;
  estimatedTime: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  shortcuts?: NavigationLink[];
}

export interface NavigationContext {
  currentPage: string;
  provider?: CloudProvider;
  service?: CloudService;
  userGoal?: string;
  completedSteps?: string[];
  projectType?: string;
  techStack?: string[];
}

export class NavigationAssistant {
  private navigationLinks: Map<string, NavigationLink[]> = new Map();
  private currentContext: NavigationContext | null = null;
  private navigationHistory: string[] = [];
  private customLinks: NavigationLink[] = [];

  constructor() {
    this.initializeNavigationLinks();
  }

  /**
   * Initialize predefined navigation links for all cloud providers
   */
  private initializeNavigationLinks() {
    // AWS Navigation Links
    this.navigationLinks.set('aws', [
      {
        id: 'aws-console',
        url: 'https://console.aws.amazon.com',
        title: 'AWS Management Console',
        description: 'Main AWS dashboard to manage all services',
        category: 'console',
        provider: 'aws',
        icon: '🏠',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '1 min'
      },
      {
        id: 'aws-ec2',
        url: 'https://console.aws.amazon.com/ec2',
        title: 'EC2 Dashboard',
        description: 'Manage virtual servers and compute instances',
        category: 'resource',
        provider: 'aws',
        service: 'aws-lambda',
        icon: '💻',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '5 min',
        prerequisites: ['AWS account', 'IAM permissions']
      },
      {
        id: 'aws-s3',
        url: 'https://console.aws.amazon.com/s3',
        title: 'S3 Bucket Management',
        description: 'Object storage for files and static websites',
        category: 'resource',
        provider: 'aws',
        service: 'aws-s3',
        icon: '🗄️',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '3 min'
      },
      {
        id: 'aws-lambda',
        url: 'https://console.aws.amazon.com/lambda',
        title: 'Lambda Functions',
        description: 'Serverless compute service for running code',
        category: 'resource',
        provider: 'aws',
        service: 'aws-lambda',
        icon: '⚡',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '10 min'
      },
      {
        id: 'aws-rds',
        url: 'https://console.aws.amazon.com/rds',
        title: 'RDS Databases',
        description: 'Managed relational database service',
        category: 'resource',
        provider: 'aws',
        service: 'aws-rds',
        icon: '🗃️',
        requiresAuth: true,
        priority: 3,
        estimatedTime: '15 min'
      },
      {
        id: 'aws-iam',
        url: 'https://console.aws.amazon.com/iam',
        title: 'IAM Security',
        description: 'Manage users, roles, and permissions',
        category: 'setup',
        provider: 'aws',
        service: 'aws-iam',
        icon: '🔐',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '10 min'
      },
      {
        id: 'aws-cloudwatch',
        url: 'https://console.aws.amazon.com/cloudwatch',
        title: 'CloudWatch Monitoring',
        description: 'Monitor resources and applications',
        category: 'resource',
        provider: 'aws',
        icon: '📊',
        requiresAuth: true,
        priority: 4,
        estimatedTime: '5 min'
      },
      {
        id: 'aws-billing',
        url: 'https://console.aws.amazon.com/billing',
        title: 'Billing & Cost Management',
        description: 'View costs and manage billing',
        category: 'billing',
        provider: 'aws',
        icon: '💰',
        requiresAuth: true,
        priority: 5,
        estimatedTime: '2 min'
      },
      {
        id: 'aws-docs',
        url: 'https://docs.aws.amazon.com',
        title: 'AWS Documentation',
        description: 'Official AWS documentation and guides',
        category: 'documentation',
        provider: 'aws',
        icon: '📚',
        requiresAuth: false,
        priority: 6,
        estimatedTime: '0 min'
      },
      {
        id: 'aws-support',
        url: 'https://console.aws.amazon.com/support',
        title: 'AWS Support Center',
        description: 'Get help and open support tickets',
        category: 'support',
        provider: 'aws',
        icon: '🆘',
        requiresAuth: true,
        priority: 7,
        estimatedTime: '5 min'
      }
    ]);

    // Google Cloud Navigation Links
    this.navigationLinks.set('gcp', [
      {
        id: 'gcp-console',
        url: 'https://console.cloud.google.com',
        title: 'Google Cloud Console',
        description: 'Main GCP dashboard',
        category: 'console',
        provider: 'gcp',
        icon: '🏠',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '1 min'
      },
      {
        id: 'gcp-compute',
        url: 'https://console.cloud.google.com/compute',
        title: 'Compute Engine',
        description: 'Virtual machines and compute resources',
        category: 'resource',
        provider: 'gcp',
        icon: '💻',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '5 min'
      },
      {
        id: 'gcp-storage',
        url: 'https://console.cloud.google.com/storage',
        title: 'Cloud Storage',
        description: 'Object storage buckets',
        category: 'resource',
        provider: 'gcp',
        service: 'gcp-cloud-storage',
        icon: '🗄️',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '3 min'
      },
      {
        id: 'gcp-run',
        url: 'https://console.cloud.google.com/run',
        title: 'Cloud Run',
        description: 'Serverless container platform',
        category: 'resource',
        provider: 'gcp',
        service: 'gcp-cloud-run',
        icon: '🏃',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '10 min'
      },
      {
        id: 'gcp-firestore',
        url: 'https://console.cloud.google.com/firestore',
        title: 'Firestore Database',
        description: 'NoSQL document database',
        category: 'resource',
        provider: 'gcp',
        service: 'gcp-firestore',
        icon: '🔥',
        requiresAuth: true,
        priority: 3,
        estimatedTime: '5 min'
      },
      {
        id: 'gcp-iam',
        url: 'https://console.cloud.google.com/iam-admin',
        title: 'IAM & Admin',
        description: 'Identity and access management',
        category: 'setup',
        provider: 'gcp',
        icon: '🔐',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '10 min'
      },
      {
        id: 'gcp-billing',
        url: 'https://console.cloud.google.com/billing',
        title: 'Billing',
        description: 'Manage billing and view costs',
        category: 'billing',
        provider: 'gcp',
        icon: '💰',
        requiresAuth: true,
        priority: 5,
        estimatedTime: '2 min'
      },
      {
        id: 'gcp-marketplace',
        url: 'https://console.cloud.google.com/marketplace',
        title: 'Marketplace',
        description: 'Deploy pre-configured solutions',
        category: 'resource',
        provider: 'gcp',
        icon: '🛒',
        requiresAuth: true,
        priority: 6,
        estimatedTime: '5 min'
      }
    ]);

    // Azure Navigation Links
    this.navigationLinks.set('azure', [
      {
        id: 'azure-portal',
        url: 'https://portal.azure.com',
        title: 'Azure Portal',
        description: 'Main Azure management portal',
        category: 'console',
        provider: 'azure',
        icon: '🏠',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '1 min'
      },
      {
        id: 'azure-vms',
        url: 'https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.Compute%2FvirtualMachines',
        title: 'Virtual Machines',
        description: 'Create and manage VMs',
        category: 'resource',
        provider: 'azure',
        icon: '💻',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '10 min'
      },
      {
        id: 'azure-storage',
        url: 'https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.Storage%2FstorageAccounts',
        title: 'Storage Accounts',
        description: 'Blob, file, and queue storage',
        category: 'resource',
        provider: 'azure',
        icon: '🗄️',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '5 min'
      },
      {
        id: 'azure-app-service',
        url: 'https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.Web%2Fsites',
        title: 'App Services',
        description: 'Web apps and APIs',
        category: 'resource',
        provider: 'azure',
        service: 'azure-app-service',
        icon: '🌐',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '10 min'
      },
      {
        id: 'azure-cosmos',
        url: 'https://portal.azure.com/#blade/HubsExtension/BrowseResource/resourceType/Microsoft.DocumentDb%2FdatabaseAccounts',
        title: 'Cosmos DB',
        description: 'Globally distributed database',
        category: 'resource',
        provider: 'azure',
        service: 'azure-cosmos-db',
        icon: '🌍',
        requiresAuth: true,
        priority: 3,
        estimatedTime: '15 min'
      },
      {
        id: 'azure-active-directory',
        url: 'https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade',
        title: 'Azure Active Directory',
        description: 'Identity and access management',
        category: 'setup',
        provider: 'azure',
        icon: '🔐',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '10 min'
      },
      {
        id: 'azure-cost',
        url: 'https://portal.azure.com/#blade/Microsoft_Azure_CostManagement/Menu/overview',
        title: 'Cost Management',
        description: 'Monitor and optimize costs',
        category: 'billing',
        provider: 'azure',
        icon: '💰',
        requiresAuth: true,
        priority: 5,
        estimatedTime: '2 min'
      }
    ]);

    // Firebase Navigation Links
    this.navigationLinks.set('firebase', [
      {
        id: 'firebase-console',
        url: 'https://console.firebase.google.com',
        title: 'Firebase Console',
        description: 'Main Firebase dashboard',
        category: 'console',
        provider: 'firebase',
        icon: '🔥',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '1 min'
      },
      {
        id: 'firebase-auth',
        url: 'https://console.firebase.google.com/project/_/authentication',
        title: 'Authentication',
        description: 'User authentication and management',
        category: 'resource',
        provider: 'firebase',
        icon: '🔑',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '5 min',
        context: ['Requires project selection']
      },
      {
        id: 'firebase-firestore',
        url: 'https://console.firebase.google.com/project/_/firestore',
        title: 'Firestore Database',
        description: 'NoSQL cloud database',
        category: 'resource',
        provider: 'firebase',
        service: 'firebase-firestore',
        icon: '📊',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '5 min'
      },
      {
        id: 'firebase-functions',
        url: 'https://console.firebase.google.com/project/_/functions',
        title: 'Cloud Functions',
        description: 'Serverless backend functions',
        category: 'resource',
        provider: 'firebase',
        service: 'firebase-functions',
        icon: '⚡',
        requiresAuth: true,
        priority: 3,
        estimatedTime: '10 min'
      },
      {
        id: 'firebase-hosting',
        url: 'https://console.firebase.google.com/project/_/hosting',
        title: 'Hosting',
        description: 'Static and dynamic web hosting',
        category: 'resource',
        provider: 'firebase',
        icon: '🌐',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '5 min'
      }
    ]);

    // Heroku Navigation Links
    this.navigationLinks.set('heroku', [
      {
        id: 'heroku-dashboard',
        url: 'https://dashboard.heroku.com',
        title: 'Heroku Dashboard',
        description: 'Main Heroku dashboard',
        category: 'console',
        provider: 'heroku',
        icon: '🏠',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '1 min'
      },
      {
        id: 'heroku-apps',
        url: 'https://dashboard.heroku.com/apps',
        title: 'Apps',
        description: 'Manage your Heroku applications',
        category: 'resource',
        provider: 'heroku',
        service: 'heroku-dyno',
        icon: '📱',
        requiresAuth: true,
        priority: 2,
        estimatedTime: '3 min'
      },
      {
        id: 'heroku-new',
        url: 'https://dashboard.heroku.com/new-app',
        title: 'Create New App',
        description: 'Deploy a new application',
        category: 'setup',
        provider: 'heroku',
        icon: '➕',
        requiresAuth: true,
        priority: 1,
        estimatedTime: '5 min'
      },
      {
        id: 'heroku-addons',
        url: 'https://elements.heroku.com/addons',
        title: 'Add-ons Marketplace',
        description: 'Browse and install add-ons',
        category: 'resource',
        provider: 'heroku',
        icon: '🧩',
        requiresAuth: false,
        priority: 3,
        estimatedTime: '5 min'
      }
    ]);
  }

  /**
   * Get navigation links for current context
   */
  public getNavigationLinks(context?: NavigationContext): NavigationLink[] {
    const provider = context?.provider || this.detectProvider();
    const links = this.navigationLinks.get(provider || 'aws') || [];

    // Filter and sort based on context
    let filteredLinks = [...links, ...this.customLinks];

    if (context?.service) {
      // Prioritize links related to the specific service
      filteredLinks = filteredLinks.sort((a, b) => {
        if (a.service === context.service) return -1;
        if (b.service === context.service) return 1;
        return a.priority - b.priority;
      });
    } else {
      filteredLinks = filteredLinks.sort((a, b) => a.priority - b.priority);
    }

    // Add contextual links based on user goal
    if (context?.userGoal) {
      const contextualLinks = this.generateContextualLinks(context.userGoal, provider || 'aws');
      filteredLinks = [...contextualLinks, ...filteredLinks];
    }

    return filteredLinks;
  }

  /**
   * Generate step-by-step navigation path
   */
  public generateNavigationPath(
    from: string,
    to: string,
    goal: string
  ): NavigationPath {
    const steps: NavigationStep[] = [];
    const provider = this.detectProvider(from) || this.detectProvider(to);

    // Generate intelligent navigation steps based on goal
    if (goal.toLowerCase().includes('deploy')) {
      steps.push(...this.generateDeploymentSteps(provider || 'aws', from, to));
    } else if (goal.toLowerCase().includes('database')) {
      steps.push(...this.generateDatabaseSteps(provider || 'aws', from, to));
    } else if (goal.toLowerCase().includes('storage')) {
      steps.push(...this.generateStorageSteps(provider || 'aws', from, to));
    } else {
      steps.push(...this.generateGenericSteps(from, to));
    }

    // Find shortcuts
    const shortcuts = this.findShortcuts(from, to, provider || 'aws');

    return {
      id: `path_${Date.now()}`,
      goal,
      currentUrl: from,
      targetUrl: to,
      steps,
      totalSteps: steps.length,
      estimatedTime: steps.reduce((acc, step) => acc + (this.estimateStepTime(step)), 0),
      difficulty: this.calculateDifficulty(steps),
      shortcuts
    };
  }

  /**
   * Generate deployment-specific navigation steps
   */
  private generateDeploymentSteps(
    provider: CloudProvider,
    from: string,
    to: string
  ): NavigationStep[] {
    const steps: NavigationStep[] = [];

    switch (provider) {
      case 'aws':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to AWS Console',
            description: 'Navigate to the AWS Management Console',
            url: 'https://console.aws.amazon.com',
            helpText: 'Sign in with your AWS account credentials',
            validationCriteria: ['AWS logo visible', 'Dashboard loaded'],
            commonIssues: ['MFA required', 'Account not activated']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Select Region',
            description: 'Choose your deployment region',
            selector: '#nav-regionMenu',
            helpText: 'Select the region closest to your users',
            screenshot: 'aws-region-selector.png',
            validationCriteria: ['Region selected', 'Region name visible']
          },
          {
            stepNumber: 3,
            action: 'navigate',
            title: 'Open Service',
            description: 'Navigate to the deployment service',
            url: to,
            helpText: 'This will open the specific AWS service for deployment',
            validationCriteria: ['Service page loaded', 'Create button visible']
          },
          {
            stepNumber: 4,
            action: 'click',
            title: 'Create New Resource',
            description: 'Click the create button to start deployment',
            selector: 'button[data-testid="create-button"], button:contains("Create")',
            helpText: 'Look for Create, Launch, or Get Started button',
            alternativePaths: [
              {
                stepNumber: 4,
                action: 'click',
                title: 'Alternative: Use Quick Start',
                description: 'Use the quick start wizard if available',
                selector: '[data-testid="quick-start"]',
                helpText: 'Quick start provides pre-configured templates'
              } as NavigationStep
            ]
          }
        );
        break;

      case 'gcp':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to GCP Console',
            description: 'Navigate to Google Cloud Console',
            url: 'https://console.cloud.google.com',
            helpText: 'Sign in with your Google account',
            validationCriteria: ['GCP logo visible', 'Project selector available']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Select Project',
            description: 'Choose or create a project',
            selector: '.cfc-project-selector',
            helpText: 'Select an existing project or create a new one',
            validationCriteria: ['Project selected', 'Project ID visible']
          },
          {
            stepNumber: 3,
            action: 'navigate',
            title: 'Navigate to Service',
            description: 'Go to the target service',
            url: to,
            helpText: 'Opens the specific GCP service',
            validationCriteria: ['Service loaded', 'Create option available']
          }
        );
        break;

      case 'azure':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to Azure Portal',
            description: 'Navigate to Microsoft Azure Portal',
            url: 'https://portal.azure.com',
            helpText: 'Sign in with your Microsoft account',
            validationCriteria: ['Azure portal loaded', 'Navigation menu visible']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Create Resource',
            description: 'Click on Create a resource',
            selector: '#create-resource-button, [aria-label="Create a resource"]',
            helpText: 'Usually found in the left navigation or home page',
            validationCriteria: ['Marketplace opened', 'Search box visible']
          }
        );
        break;
    }

    return steps;
  }

  /**
   * Generate database-specific navigation steps
   */
  private generateDatabaseSteps(
    provider: CloudProvider,
    from: string,
    to: string
  ): NavigationStep[] {
    const steps: NavigationStep[] = [];

    switch (provider) {
      case 'aws':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to RDS Console',
            description: 'Navigate to Amazon RDS',
            url: 'https://console.aws.amazon.com/rds',
            helpText: 'RDS manages relational databases',
            validationCriteria: ['RDS dashboard loaded']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Create Database',
            description: 'Click Create database button',
            selector: 'button[href*="create"]',
            helpText: 'Start the database creation wizard',
            validationCriteria: ['Creation wizard opened']
          },
          {
            stepNumber: 3,
            action: 'select',
            title: 'Choose Engine',
            description: 'Select database engine (MySQL, PostgreSQL, etc.)',
            selector: 'input[name="engine"]',
            helpText: 'Choose based on your application requirements',
            validationCriteria: ['Engine selected']
          }
        );
        break;

      case 'gcp':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to Cloud SQL',
            description: 'Navigate to Cloud SQL instances',
            url: 'https://console.cloud.google.com/sql',
            helpText: 'Cloud SQL provides managed databases',
            validationCriteria: ['Cloud SQL page loaded']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Create Instance',
            description: 'Click Create Instance button',
            selector: 'button[aria-label="Create instance"]',
            helpText: 'Start creating a new database instance',
            validationCriteria: ['Instance creation started']
          }
        );
        break;
    }

    return steps;
  }

  /**
   * Generate storage-specific navigation steps
   */
  private generateStorageSteps(
    provider: CloudProvider,
    from: string,
    to: string
  ): NavigationStep[] {
    const steps: NavigationStep[] = [];

    switch (provider) {
      case 'aws':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to S3 Console',
            description: 'Navigate to Amazon S3',
            url: 'https://console.aws.amazon.com/s3',
            helpText: 'S3 provides object storage',
            validationCriteria: ['S3 console loaded', 'Buckets list visible']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Create Bucket',
            description: 'Click Create bucket button',
            selector: 'button:contains("Create bucket")',
            helpText: 'Start creating a new storage bucket',
            validationCriteria: ['Bucket creation wizard opened']
          },
          {
            stepNumber: 3,
            action: 'fill',
            title: 'Enter Bucket Name',
            description: 'Provide a unique bucket name',
            selector: 'input[name="bucket-name"]',
            helpText: 'Bucket names must be globally unique',
            validationCriteria: ['Valid bucket name entered'],
            commonIssues: ['Name already taken', 'Invalid characters used']
          }
        );
        break;

      case 'gcp':
        steps.push(
          {
            stepNumber: 1,
            action: 'navigate',
            title: 'Go to Cloud Storage',
            description: 'Navigate to Cloud Storage browser',
            url: 'https://console.cloud.google.com/storage',
            helpText: 'Cloud Storage provides object storage',
            validationCriteria: ['Storage browser loaded']
          },
          {
            stepNumber: 2,
            action: 'click',
            title: 'Create Bucket',
            description: 'Click Create bucket button',
            selector: 'button[aria-label="Create bucket"]',
            helpText: 'Start the bucket creation process',
            validationCriteria: ['Bucket form opened']
          }
        );
        break;
    }

    return steps;
  }

  /**
   * Generate generic navigation steps
   */
  private generateGenericSteps(from: string, to: string): NavigationStep[] {
    return [
      {
        stepNumber: 1,
        action: 'navigate',
        title: 'Navigate to Target Page',
        description: `Go from ${this.extractDomain(from)} to ${this.extractDomain(to)}`,
        url: to,
        helpText: 'Click the link or enter the URL in your browser',
        validationCriteria: ['Target page loaded']
      }
    ];
  }

  /**
   * Generate contextual links based on user goal
   */
  private generateContextualLinks(goal: string, provider: CloudProvider): NavigationLink[] {
    const contextualLinks: NavigationLink[] = [];
    const goalLower = goal.toLowerCase();

    // Add links based on keywords in the goal
    if (goalLower.includes('deploy') || goalLower.includes('host')) {
      contextualLinks.push({
        id: `${provider}-deploy-guide`,
        url: this.getDeploymentGuideUrl(provider),
        title: 'Deployment Guide',
        description: 'Step-by-step deployment instructions',
        category: 'documentation',
        provider,
        icon: '📖',
        requiresAuth: false,
        priority: 0,
        estimatedTime: '10 min'
      });
    }

    if (goalLower.includes('database') || goalLower.includes('sql')) {
      contextualLinks.push({
        id: `${provider}-database-quickstart`,
        url: this.getDatabaseQuickstartUrl(provider),
        title: 'Database Quick Start',
        description: 'Get started with databases quickly',
        category: 'documentation',
        provider,
        icon: '💾',
        requiresAuth: false,
        priority: 0,
        estimatedTime: '15 min'
      });
    }

    if (goalLower.includes('api') || goalLower.includes('serverless')) {
      contextualLinks.push({
        id: `${provider}-serverless-guide`,
        url: this.getServerlessGuideUrl(provider),
        title: 'Serverless Guide',
        description: 'Build serverless applications',
        category: 'documentation',
        provider,
        icon: '⚡',
        requiresAuth: false,
        priority: 0,
        estimatedTime: '20 min'
      });
    }

    if (goalLower.includes('monitor') || goalLower.includes('log')) {
      contextualLinks.push({
        id: `${provider}-monitoring`,
        url: this.getMonitoringUrl(provider),
        title: 'Monitoring & Logs',
        description: 'Monitor your applications',
        category: 'resource',
        provider,
        icon: '📊',
        requiresAuth: true,
        priority: 0,
        estimatedTime: '5 min'
      });
    }

    return contextualLinks;
  }

  /**
   * Find shortcuts between two points
   */
  private findShortcuts(from: string, to: string, provider: CloudProvider): NavigationLink[] {
    const shortcuts: NavigationLink[] = [];
    const providerLinks = this.navigationLinks.get(provider) || [];

    // Find direct links that can shortcut the navigation
    providerLinks.forEach(link => {
      if (link.url === to || link.url.includes(this.extractPath(to))) {
        shortcuts.push(link);
      }
    });

    return shortcuts;
  }

  /**
   * Detect cloud provider from URL
   */
  private detectProvider(url?: string): CloudProvider | null {
    const checkUrl = url || window.location.href;

    if (checkUrl.includes('console.aws.amazon.com')) return 'aws';
    if (checkUrl.includes('console.cloud.google.com')) return 'gcp';
    if (checkUrl.includes('portal.azure.com')) return 'azure';
    if (checkUrl.includes('console.firebase.google.com')) return 'firebase';
    if (checkUrl.includes('dashboard.heroku.com')) return 'heroku';

    return null;
  }

  /**
   * Get deployment guide URL for provider
   */
  private getDeploymentGuideUrl(provider: CloudProvider): string {
    const guides: Record<CloudProvider, string> = {
      aws: 'https://docs.aws.amazon.com/gettingstarted/',
      gcp: 'https://cloud.google.com/docs/get-started',
      azure: 'https://docs.microsoft.com/azure/guides/developer/azure-developer-guide',
      firebase: 'https://firebase.google.com/docs/guides',
      heroku: 'https://devcenter.heroku.com/start',
      digitalocean: 'https://docs.digitalocean.com/products/app-platform/quickstart/',
      vercel: 'https://vercel.com/docs/getting-started',
      netlify: 'https://docs.netlify.com/get-started/',
      generic: 'https://www.google.com/search?q=cloud+deployment+guide'
    };
    return guides[provider];
  }

  /**
   * Get database quickstart URL for provider
   */
  private getDatabaseQuickstartUrl(provider: CloudProvider): string {
    const urls: Record<CloudProvider, string> = {
      aws: 'https://aws.amazon.com/getting-started/hands-on/create-mysql-db/',
      gcp: 'https://cloud.google.com/sql/docs/quickstart',
      azure: 'https://docs.microsoft.com/azure/azure-sql/database/quickstart',
      firebase: 'https://firebase.google.com/docs/firestore/quickstart',
      heroku: 'https://devcenter.heroku.com/articles/heroku-postgresql',
      digitalocean: 'https://docs.digitalocean.com/products/databases/quickstart/',
      vercel: 'https://vercel.com/docs/storage',
      netlify: 'https://www.netlify.com/products/build/',
      generic: '#'
    };
    return urls[provider];
  }

  /**
   * Get serverless guide URL for provider
   */
  private getServerlessGuideUrl(provider: CloudProvider): string {
    const urls: Record<CloudProvider, string> = {
      aws: 'https://aws.amazon.com/lambda/getting-started/',
      gcp: 'https://cloud.google.com/functions/docs/quickstart',
      azure: 'https://docs.microsoft.com/azure/azure-functions/functions-get-started',
      firebase: 'https://firebase.google.com/docs/functions/get-started',
      heroku: 'https://www.heroku.com/platform/runtime',
      digitalocean: 'https://docs.digitalocean.com/products/functions/',
      vercel: 'https://vercel.com/docs/functions',
      netlify: 'https://www.netlify.com/products/functions/',
      generic: '#'
    };
    return urls[provider];
  }

  /**
   * Get monitoring URL for provider
   */
  private getMonitoringUrl(provider: CloudProvider): string {
    const urls: Record<CloudProvider, string> = {
      aws: 'https://console.aws.amazon.com/cloudwatch',
      gcp: 'https://console.cloud.google.com/monitoring',
      azure: 'https://portal.azure.com/#blade/Microsoft_Azure_Monitoring/AzureMonitoringBrowseBlade',
      firebase: 'https://console.firebase.google.com/project/_/performance',
      heroku: 'https://dashboard.heroku.com/apps/_/metrics',
      digitalocean: 'https://cloud.digitalocean.com/monitoring',
      vercel: 'https://vercel.com/dashboard/analytics',
      netlify: 'https://app.netlify.com/sites/_/analytics',
      generic: '#'
    };
    return urls[provider];
  }

  /**
   * Calculate difficulty of navigation path
   */
  private calculateDifficulty(steps: NavigationStep[]): 'beginner' | 'intermediate' | 'advanced' {
    const complexity = steps.reduce((acc, step) => {
      if (step.action === 'fill' || step.action === 'select') return acc + 2;
      if (step.alternativePaths && step.alternativePaths.length > 0) return acc + 3;
      return acc + 1;
    }, 0);

    if (complexity <= 5) return 'beginner';
    if (complexity <= 10) return 'intermediate';
    return 'advanced';
  }

  /**
   * Estimate time for a navigation step
   */
  private estimateStepTime(step: NavigationStep): number {
    const times: Record<NavigationStep['action'], number> = {
      navigate: 3,
      click: 1,
      fill: 2,
      select: 2,
      wait: 5,
      verify: 2
    };
    return times[step.action] || 2;
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Extract path from URL
   */
  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return '';
    }
  }

  /**
   * Add custom navigation link
   */
  public addCustomLink(link: NavigationLink): void {
    this.customLinks.push(link);
  }

  /**
   * Get navigation history
   */
  public getNavigationHistory(): string[] {
    return this.navigationHistory;
  }

  /**
   * Add to navigation history
   */
  public addToHistory(url: string): void {
    this.navigationHistory.push(url);
    if (this.navigationHistory.length > 20) {
      this.navigationHistory.shift();
    }
  }

  /**
   * Update context
   */
  public updateContext(context: NavigationContext): void {
    this.currentContext = context;
  }

  /**
   * Get current context
   */
  public getContext(): NavigationContext | null {
    return this.currentContext;
  }

  /**
   * Get breadcrumb trail
   */
  public getBreadcrumbs(): string[] {
    if (!this.currentContext) return [];

    const breadcrumbs: string[] = [];

    if (this.currentContext.provider) {
      breadcrumbs.push(this.currentContext.provider.toUpperCase());
    }

    if (this.currentContext.service) {
      breadcrumbs.push(this.currentContext.service.replace(/-/g, ' ').toUpperCase());
    }

    if (this.currentContext.currentPage) {
      const pageName = this.extractPath(this.currentContext.currentPage)
        .split('/')
        .filter(p => p)
        .pop();
      if (pageName) {
        breadcrumbs.push(pageName.toUpperCase());
      }
    }

    return breadcrumbs;
  }

  /**
   * Search for relevant links
   */
  public searchLinks(query: string, provider?: CloudProvider): NavigationLink[] {
    const searchProvider = provider || this.detectProvider();
    const allLinks = [...(this.navigationLinks.get(searchProvider || 'aws') || []), ...this.customLinks];

    const queryLower = query.toLowerCase();
    return allLinks.filter(link =>
      link.title.toLowerCase().includes(queryLower) ||
      link.description.toLowerCase().includes(queryLower) ||
      link.category.includes(queryLower)
    );
  }

  /**
   * Get quick actions for current page
   */
  public getQuickActions(): NavigationLink[] {
    const provider = this.detectProvider();
    if (!provider) return [];

    const links = this.navigationLinks.get(provider) || [];
    return links
      .filter(link => link.category === 'setup' || link.priority <= 2)
      .slice(0, 5);
  }
}

// Export singleton instance
export const navigationAssistant = new NavigationAssistant();