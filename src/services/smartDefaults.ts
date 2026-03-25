import { CloudService, CloudServiceConfig, SetupStep } from '@/types';

const CLOUD_SERVICE_CONFIGS: Record<CloudService, CloudServiceConfig> = {
  'aws-lambda': {
    service: 'aws-lambda',
    smartDefaults: {
      timeout: 30,
      memorySize: 256,
      runtime: 'nodejs18.x',
      ephemeralStorage: 512
    },
    requiredFields: ['functionName', 'runtime', 'handler'],
    optionalFields: ['timeout', 'memorySize', 'environmentVariables', 'ephemeralStorage'],
    documentationUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/getting-started.html'
  },
  'aws-s3': {
    service: 'aws-s3',
    smartDefaults: {
      blockPublicAcls: true,
      ignorePublicAcls: true,
      blockPublicPolicy: true,
      restrictPublicBuckets: true,
      versioning: true
    },
    requiredFields: ['bucketName', 'region'],
    optionalFields: ['acl', 'versioning', 'encryption', 'logging'],
    documentationUrl: 'https://docs.aws.amazon.com/s3/latest/gsg/GetStartedWithS3.html'
  },
  'aws-rds': {
    service: 'aws-rds',
    smartDefaults: {
      engine: 'postgres',
      instanceClass: 'db.t3.micro',
      allocatedStorage: 20,
      storageType: 'gp2',
      multiAZ: false,
      publiclyAccessible: false
    },
    requiredFields: ['dbName', 'masterUsername', 'masterUserPassword', 'engine', 'instanceClass'],
    optionalFields: ['allocatedStorage', 'backupRetentionPeriod', 'deletionProtection'],
    documentationUrl: 'https://docs.aws.amazon.com/rds/latest/UserGuide/CHAP_Getting_Started.html'
  },
  'aws-dynamodb': {
    service: 'aws-dynamodb',
    smartDefaults: {
      billingMode: 'PAY_PER_REQUEST',
      streamSpecification: 'NEW_AND_OLD_IMAGES',
      ttlAttributeName: 'ttl'
    },
    requiredFields: ['tableName', 'partitionKey'],
    optionalFields: ['sortKey', 'billingMode', 'globalSecondaryIndexes', 'streamSpecification'],
    documentationUrl: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStarted.html'
  },
  'aws-api-gateway': {
    service: 'aws-api-gateway',
    smartDefaults: {
      protocol: 'REST',
      endpointType: 'REGIONAL'
    },
    requiredFields: ['apiName', 'endpointType'],
    optionalFields: ['description', 'binaryMediaTypes', 'logging'],
    documentationUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started.html'
  },
  'aws-iam': {
    service: 'aws-iam',
    smartDefaults: {
      assumeRolePolicy: 'lambda.amazonaws.com'
    },
    requiredFields: ['roleName', 'trustEntity'],
    optionalFields: ['description', 'policies', 'tags'],
    documentationUrl: 'https://docs.aws.amazon.com/iam/latest/userguide/getting-started.html'
  },
  'gcp-cloud-run': {
    service: 'gcp-cloud-run',
    smartDefaults: {
      memory: '256Mi',
      cpu: '1',
      timeout: 300,
      concurrency: 80
    },
    requiredFields: ['serviceName', 'containerImage', 'region'],
    optionalFields: ['memory', 'cpu', 'timeout', 'environmentVariables'],
    documentationUrl: 'https://cloud.google.com/run/docs/quickstarts/build-and-deploy'
  },
  'gcp-firestore': {
    service: 'gcp-firestore',
    smartDefaults: {
      database: 'default',
      location: 'us-central1'
    },
    requiredFields: ['projectId'],
    optionalFields: ['database', 'location'],
    documentationUrl: 'https://cloud.google.com/firestore/docs/quickstart'
  },
  'gcp-cloud-storage': {
    service: 'gcp-cloud-storage',
    smartDefaults: {
      location: 'US',
      storageClass: 'STANDARD',
      versioning: false
    },
    requiredFields: ['bucketName', 'location'],
    optionalFields: ['storageClass', 'versioning', 'logging'],
    documentationUrl: 'https://cloud.google.com/storage/docs/quickstart-console'
  },
  'gcp-app-engine': {
    service: 'gcp-app-engine',
    smartDefaults: {
      runtime: 'nodejs18',
      region: 'us-central1',
      instanceClass: 'F1'
    },
    requiredFields: ['projectId', 'runtime'],
    optionalFields: ['region', 'instanceClass', 'environmentVariables'],
    documentationUrl: 'https://cloud.google.com/appengine/docs/standard/nodejs/quickstart'
  },
  'firebase-functions': {
    service: 'firebase-functions',
    smartDefaults: {
      runtime: 'nodejs18',
      memory: 256,
      timeout: 60
    },
    requiredFields: ['functionName', 'trigger'],
    optionalFields: ['memory', 'timeout', 'environmentVariables'],
    documentationUrl: 'https://firebase.google.com/docs/functions/get-started'
  },
  'firebase-firestore': {
    service: 'firebase-firestore',
    smartDefaults: {
      database: 'default',
      region: 'us-central1'
    },
    requiredFields: ['projectId'],
    optionalFields: ['database', 'region'],
    documentationUrl: 'https://firebase.google.com/docs/firestore/quickstart'
  },
  'azure-app-service': {
    service: 'azure-app-service',
    smartDefaults: {
      tier: 'Standard',
      skuName: 'S1',
      numberOfWorkers: 1
    },
    requiredFields: ['appName', 'resourceGroup', 'appServicePlan'],
    optionalFields: ['runtime', 'numberOfWorkers', 'alwaysOn'],
    documentationUrl: 'https://docs.microsoft.com/en-us/azure/app-service/app-service-web-get-started-nodejs'
  },
  'azure-cosmos-db': {
    service: 'azure-cosmos-db',
    smartDefaults: {
      apiType: 'sql',
      tier: 'Standard',
      throughput: 400
    },
    requiredFields: ['accountName', 'resourceGroup', 'location'],
    optionalFields: ['apiType', 'throughput', 'backup'],
    documentationUrl: 'https://docs.microsoft.com/en-us/azure/cosmos-db/how-to-choose-offer'
  },
  'heroku-dyno': {
    service: 'heroku-dyno',
    smartDefaults: {
      dynoType: 'web',
      size: 'eco'
    },
    requiredFields: ['appName', 'dynoType'],
    optionalFields: ['size', 'region', 'buildpack'],
    documentationUrl: 'https://devcenter.heroku.com/articles/getting-started-with-nodejs'
  }
};

const SETUP_STEPS: Record<CloudService, SetupStep[]> = {
  'aws-lambda': [
    {
      order: 1,
      title: 'Create Lambda Function',
      description: 'Set up your Lambda function',
      fieldName: 'functionName',
      helpText: 'Enter a descriptive name for your Lambda function (e.g., "my-api-handler")'
    },
    {
      order: 2,
      title: 'Select Runtime',
      description: 'Choose the programming language runtime',
      fieldName: 'runtime',
      suggestedValue: 'nodejs18.x',
      helpText: 'Select the runtime that matches your codebase language'
    },
    {
      order: 3,
      title: 'Set Handler',
      description: 'Specify the entry point for your function',
      fieldName: 'handler',
      suggestedValue: 'index.handler',
      helpText: 'This should match your exported function in the code'
    },
    {
      order: 4,
      title: 'Configure Memory',
      description: 'Allocate memory for the function',
      fieldName: 'memorySize',
      suggestedValue: 256,
      helpText: 'More memory = faster execution but higher cost. Start with 256MB'
    },
    {
      order: 5,
      title: 'Set Timeout',
      description: 'Set the maximum execution time',
      fieldName: 'timeout',
      suggestedValue: 30,
      helpText: 'Maximum execution time in seconds. Default is 30s'
    }
  ],
  'aws-s3': [
    {
      order: 1,
      title: 'Create Bucket',
      description: 'Create a new S3 bucket',
      fieldName: 'bucketName',
      helpText: 'Bucket names must be globally unique'
    },
    {
      order: 2,
      title: 'Select Region',
      description: 'Choose the region for your bucket',
      fieldName: 'region',
      suggestedValue: 'us-east-1',
      helpText: 'Pick a region close to your users'
    },
    {
      order: 3,
      title: 'Configure Security',
      description: 'Block public access for security',
      fieldName: 'blockPublicAcls',
      suggestedValue: true,
      helpText: 'Enable all block public access settings'
    }
  ],
  'aws-rds': [
    {
      order: 1,
      title: 'Choose Database Engine',
      description: 'Select your database type',
      fieldName: 'engine',
      suggestedValue: 'postgres',
      helpText: 'PostgreSQL is recommended for most applications'
    },
    {
      order: 2,
      title: 'Database Name',
      description: 'Create the initial database',
      fieldName: 'dbName',
      helpText: 'This is the initial database that will be created'
    },
    {
      order: 3,
      title: 'Master Username',
      description: 'Set the admin username',
      fieldName: 'masterUsername',
      suggestedValue: 'admin',
      helpText: 'Username for database administration'
    },
    {
      order: 4,
      title: 'Master Password',
      description: 'Set a strong master password',
      fieldName: 'masterUserPassword',
      helpText: 'Use a strong password with uppercase, lowercase, numbers, and symbols'
    }
  ],
  'aws-dynamodb': [
    {
      order: 1,
      title: 'Table Name',
      description: 'Create your DynamoDB table',
      fieldName: 'tableName',
      helpText: 'Choose a descriptive table name'
    },
    {
      order: 2,
      title: 'Partition Key',
      description: 'Define the partition key',
      fieldName: 'partitionKey',
      helpText: 'This uniquely identifies items in your table'
    },
    {
      order: 3,
      title: 'Billing Mode',
      description: 'Choose billing mode',
      fieldName: 'billingMode',
      suggestedValue: 'PAY_PER_REQUEST',
      helpText: 'PAY_PER_REQUEST is good for unpredictable workloads'
    }
  ],
  'aws-api-gateway': [
    {
      order: 1,
      title: 'API Name',
      description: 'Name your API',
      fieldName: 'apiName',
      helpText: 'Choose a descriptive name for your API'
    },
    {
      order: 2,
      title: 'Endpoint Type',
      description: 'Select endpoint type',
      fieldName: 'endpointType',
      suggestedValue: 'REGIONAL',
      helpText: 'REGIONAL is recommended for most use cases'
    }
  ],
  'aws-iam': [
    {
      order: 1,
      title: 'Role Name',
      description: 'Create an IAM role',
      fieldName: 'roleName',
      helpText: 'Give your role a descriptive name'
    },
    {
      order: 2,
      title: 'Trust Entity',
      description: 'Select service that can assume this role',
      fieldName: 'trustEntity',
      suggestedValue: 'lambda.amazonaws.com',
      helpText: 'This is the service that will use this role'
    }
  ],
  'gcp-cloud-run': [
    {
      order: 1,
      title: 'Service Name',
      description: 'Name your Cloud Run service',
      fieldName: 'serviceName',
      helpText: 'Choose a descriptive name for your service'
    },
    {
      order: 2,
      title: 'Container Image',
      description: 'Specify the container image',
      fieldName: 'containerImage',
      helpText: 'Use your Docker image from Container Registry or Artifact Registry'
    },
    {
      order: 3,
      title: 'Region',
      description: 'Select deployment region',
      fieldName: 'region',
      suggestedValue: 'us-central1',
      helpText: 'Choose a region close to your users'
    }
  ],
  'gcp-app-engine': [
    {
      order: 1,
      title: 'Select Runtime',
      description: 'Choose your application runtime',
      fieldName: 'runtime',
      suggestedValue: 'nodejs18',
      helpText: 'Select the runtime matching your codebase'
    },
    {
      order: 2,
      title: 'Select Region',
      description: 'Choose deployment region',
      fieldName: 'region',
      suggestedValue: 'us-central1',
      helpText: 'Choose a region close to your users'
    }
  ],
  'gcp-firestore': [
    {
      order: 1,
      title: 'Create Database',
      description: 'Initialize Firestore database',
      fieldName: 'projectId',
      helpText: 'Select your GCP project'
    }
  ],
  'gcp-cloud-storage': [
    {
      order: 1,
      title: 'Bucket Name',
      description: 'Create a storage bucket',
      fieldName: 'bucketName',
      helpText: 'Bucket names must be globally unique'
    },
    {
      order: 2,
      title: 'Location',
      description: 'Choose bucket location',
      fieldName: 'location',
      suggestedValue: 'US',
      helpText: 'Select a location close to your users'
    }
  ],
  'firebase-functions': [
    {
      order: 1,
      title: 'Function Name',
      description: 'Create a Cloud Function',
      fieldName: 'functionName',
      helpText: 'Give your function a descriptive name'
    },
    {
      order: 2,
      title: 'Trigger',
      description: 'Select function trigger',
      fieldName: 'trigger',
      helpText: 'Choose when this function should execute'
    }
  ],
  'firebase-firestore': [
    {
      order: 1,
      title: 'Create Database',
      description: 'Initialize Firebase Firestore',
      fieldName: 'projectId',
      helpText: 'Select your Firebase project'
    }
  ],
  'azure-app-service': [
    {
      order: 1,
      title: 'App Name',
      description: 'Create your web app',
      fieldName: 'appName',
      helpText: 'This becomes part of your app URL'
    },
    {
      order: 2,
      title: 'Resource Group',
      description: 'Select or create resource group',
      fieldName: 'resourceGroup',
      helpText: 'Group related resources together'
    }
  ],
  'azure-cosmos-db': [
    {
      order: 1,
      title: 'Account Name',
      description: 'Create a Cosmos DB account',
      fieldName: 'accountName',
      helpText: 'Account name must be globally unique'
    },
    {
      order: 2,
      title: 'API Type',
      description: 'Choose the database API',
      fieldName: 'apiType',
      suggestedValue: 'sql',
      helpText: 'SQL API is most commonly used'
    }
  ],
  'heroku-dyno': [
    {
      order: 1,
      title: 'App Name',
      description: 'Create your Heroku app',
      fieldName: 'appName',
      helpText: 'App name must be globally unique'
    },
    {
      order: 2,
      title: 'Choose Region',
      description: 'Select deployment region',
      fieldName: 'region',
      suggestedValue: 'us',
      helpText: 'Choose a region close to your users'
    }
  ]
};

export class SmartDefaultsService {
  /**
   * Get configuration for a service
   */
  getServiceConfig(service: CloudService): CloudServiceConfig {
    return CLOUD_SERVICE_CONFIGS[service];
  }

  /**
   * Get setup steps for a service
   */
  getSetupSteps(service: CloudService): SetupStep[] {
    return SETUP_STEPS[service] || [];
  }

  /**
   * Get smart defaults based on detected patterns
   */
  getSmartDefaults(service: CloudService, codePatterns: any[]): Record<string, any> {
    const config = CLOUD_SERVICE_CONFIGS[service];
    const defaults = { ...config.smartDefaults };

    // Adjust defaults based on code patterns
    // This is where you can apply intelligence based on the actual codebase
    codePatterns.forEach(pattern => {
      if (pattern.service === service) {
        // Apply specific defaults based on detected patterns
        // Example: if using Express.js, might want more memory for Lambda
      }
    });

    return defaults;
  }

  /**
   * Generate help text for a field
   */
  getFieldHelp(service: CloudService, fieldName: string): string {
    const steps = this.getSetupSteps(service);
    const step = steps.find(s => s.fieldName === fieldName);
    return step?.helpText || '';
  }

  /**
   * Get suggested value for a field
   */
  getSuggestedValue(service: CloudService, fieldName: string): any {
    const steps = this.getSetupSteps(service);
    const step = steps.find(s => s.fieldName === fieldName);
    return step?.suggestedValue || null;
  }
}

export const smartDefaultsService = new SmartDefaultsService();
