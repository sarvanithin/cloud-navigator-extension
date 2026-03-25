import { CloudService, AnalysisResult, Repository, DetectedService, CodePattern } from '@/types';
import { githubService } from './github';

const SERVICE_PATTERNS = {
  'aws-lambda': {
    dependencies: ['aws-sdk', 'aws-lambda', '@aws-sdk/client-lambda'],
    patterns: ['handler(event', 'aws.lambda', 'LambdaClient', 'InvokeCommand'],
    language: ['nodejs', 'python', 'java']
  },
  'aws-s3': {
    dependencies: ['aws-sdk', 'aws-s3', '@aws-sdk/client-s3'],
    patterns: ['S3Client', 'GetObjectCommand', 'PutObjectCommand', 'aws.s3', 's3:GetObject'],
    language: ['nodejs', 'python', 'java']
  },
  'aws-rds': {
    dependencies: ['pg', 'mysql2', 'mysql', 'sequelize', 'typeorm', 'knex'],
    patterns: ['RDS', 'database', 'SQL_HOST', 'DB_HOST', 'connection.pool'],
    language: ['nodejs', 'python', 'java']
  },
  'aws-dynamodb': {
    dependencies: ['@aws-sdk/client-dynamodb', 'aws-sdk', 'dynamodb'],
    patterns: ['DynamoDBClient', 'GetCommand', 'PutCommand', 'dynamodb:', 'Table.get_item'],
    language: ['nodejs', 'python', 'java']
  },
  'gcp-cloud-run': {
    dependencies: ['google-cloud-run', '@google-cloud/run', 'flask', 'express'],
    patterns: ['Cloud Run', 'containerized', 'Dockerfile', 'PORT'],
    language: ['nodejs', 'python', 'go', 'java']
  },
  'gcp-firestore': {
    dependencies: ['@google-cloud/firestore', 'firebase-admin', 'firebase'],
    patterns: ['Firestore', 'firebase', 'db.collection', 'getFirestore'],
    language: ['nodejs', 'python', 'java']
  },
  'firebase-functions': {
    dependencies: ['firebase-functions', 'firebase-admin'],
    patterns: ['onRequest', 'onDocumentCreated', 'initializeApp', 'firebase'],
    language: ['nodejs']
  },
  'heroku': {
    dependencies: ['dotenv', 'foreman', 'express'],
    patterns: ['Procfile', 'process.env.PORT', 'Heroku', 'heroku.com'],
    language: ['nodejs', 'python', 'ruby', 'java']
  }
};

export class CodebaseAnalyzer {
  /**
   * Analyze repository for cloud services
   */
  async analyzeRepository(
    owner: string,
    repo: string,
    defaultBranch: string = 'main'
  ): Promise<DetectedService[]> {
    try {
      // Read package.json, requirements.txt, etc.
      const dependencies = await this.extractDependencies(owner, repo);

      // Scan for code patterns
      const patterns = await this.scanForPatterns(owner, repo);

      // Detect services
      const detectedServices = this.detectServices(dependencies, patterns);

      return detectedServices;
    } catch (error) {
      console.error('Analysis failed:', error);
      return [];
    }
  }

  /**
   * Extract dependencies from common package files
   */
  private async extractDependencies(owner: string, repo: string): Promise<string[]> {
    const dependencies: string[] = [];
    const packageFiles = [
      'package.json',
      'requirements.txt',
      'Gemfile',
      'go.mod',
      'pom.xml',
      'build.gradle'
    ];

    for (const file of packageFiles) {
      try {
        const content = await githubService.getFileContent(owner, repo, file);
        const fileDeps = this.parseDependenciesFromFile(file, content);
        dependencies.push(...fileDeps);
      } catch (error) {
        // File not found is expected - only log unexpected errors
        if (error instanceof Error && !error.message.includes('File not found')) {
          console.warn(`Warning analyzing ${file}:`, error.message);
        }
      }
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Parse dependencies based on file type
   */
  private parseDependenciesFromFile(filename: string, content: string): string[] {
    const deps: string[] = [];

    if (filename === 'package.json') {
      try {
        const json = JSON.parse(content);
        const allDeps = {
          ...json.dependencies,
          ...json.devDependencies
        };
        deps.push(...Object.keys(allDeps));
      } catch (e) {
        console.error('Failed to parse package.json');
      }
    } else if (filename === 'requirements.txt') {
      const lines = content.split('\n');
      lines.forEach(line => {
        const match = line.match(/^([a-zA-Z0-9_-]+)/);
        if (match) {
          deps.push(match[1]);
        }
      });
    } else if (filename === 'Gemfile') {
      const matches = content.match(/gem ['"]([^'"]+)['"]/g);
      if (matches) {
        matches.forEach(m => {
          const name = m.match(/['"]([^'"]+)['"]/);
          if (name) deps.push(name[1]);
        });
      }
    }

    return deps;
  }

  /**
   * Scan repository for code patterns
   */
  private async scanForPatterns(owner: string, repo: string): Promise<CodePattern[]> {
    const patterns: CodePattern[] = [];

    // Read README and common config files for patterns
    const filesToCheck = [
      'README.md',
      '.env.example',
      'docker-compose.yml',
      'serverless.yml',
      'sam.yaml',
      'Dockerfile'
    ];

    for (const file of filesToCheck) {
      try {
        const content = await githubService.getFileContent(owner, repo, file);
        const detectedPatterns = this.findPatternsInContent(content);
        patterns.push(...detectedPatterns);
      } catch (error) {
        // File not found is expected - only log unexpected errors
        if (error instanceof Error && !error.message.includes('File not found')) {
          console.warn(`Warning scanning patterns in ${file}:`, error.message);
        }
      }
    }

    return patterns;
  }

  /**
   * Find service patterns in content
   */
  private findPatternsInContent(content: string): CodePattern[] {
    const patterns: CodePattern[] = [];
    const contentLower = content.toLowerCase();

    Object.entries(SERVICE_PATTERNS).forEach(([service, config]) => {
      config.patterns.forEach(pattern => {
        if (contentLower.includes(pattern.toLowerCase())) {
          patterns.push({
            pattern,
            service: service as CloudService
          });
        }
      });
    });

    return patterns;
  }

  /**
   * Detect cloud services based on dependencies and patterns
   */
  private detectServices(dependencies: string[], patterns: CodePattern[]): DetectedService[] {
    const serviceScores: Record<CloudService, number> = {} as Record<CloudService, number>;

    // Score based on dependencies
    dependencies.forEach(dep => {
      Object.entries(SERVICE_PATTERNS).forEach(([service, config]) => {
        if (config.dependencies.some(d => dep.toLowerCase().includes(d.toLowerCase()))) {
          const key = service as CloudService;
          serviceScores[key] = (serviceScores[key] || 0) + 0.6;
        }
      });
    });

    // Score based on patterns
    patterns.forEach(pattern => {
      const score = serviceScores[pattern.service] || 0;
      serviceScores[pattern.service] = Math.min(score + 0.3, 1.0);
    });

    // Convert scores to detected services
    return Object.entries(serviceScores)
      .map(([service, score]) => ({
        service: service as CloudService,
        confidence: Math.min(score, 1.0),
        evidence: this.getEvidence(service as CloudService, dependencies, patterns)
      }))
      .filter(s => s.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get evidence for a detected service
   */
  private getEvidence(service: CloudService, dependencies: string[], patterns: CodePattern[]): string[] {
    const evidence: string[] = [];
    const config = SERVICE_PATTERNS[service as keyof typeof SERVICE_PATTERNS];

    if (config) {
      const matchedDeps = dependencies.filter(dep =>
        config.dependencies.some(d => dep.toLowerCase().includes(d.toLowerCase()))
      );
      evidence.push(...matchedDeps.map(d => `Dependency: ${d}`));

      const matchedPatterns = patterns
        .filter(p => p.service === service)
        .map(p => `Pattern: ${p.pattern}`);
      evidence.push(...matchedPatterns);
    }

    return evidence;
  }

  /**
   * Determine recommended setup order
   */
  determineSetupOrder(detectedServices: DetectedService[]): CloudService[] {
    // Base setup order - services that other services depend on should come first
    const orderMap: Record<CloudService, number> = {
      'aws-iam': 1,
      'aws-s3': 2,
      'gcp-cloud-storage': 2,
      'aws-rds': 3,
      'aws-dynamodb': 3,
      'gcp-firestore': 3,
      'aws-lambda': 4,
      'gcp-cloud-run': 4,
      'firebase-functions': 4,
      'aws-api-gateway': 5,
      'heroku-dyno': 6,
      'gcp-app-engine': 5,
      'azure-app-service': 5,
      'azure-cosmos-db': 3,
      'firebase-firestore': 3
    };

    return detectedServices
      .map(s => s.service)
      .sort((a, b) => (orderMap[a] || 999) - (orderMap[b] || 999));
  }
}

export const codebaseAnalyzer = new CodebaseAnalyzer();
