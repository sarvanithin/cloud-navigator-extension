import { PageDetectionResult } from '@/types';

const CLOUD_SERVICE_URLS = {
  AWS: {
    domain: 'console.aws.amazon.com',
    services: {
      lambda: '/lambda',
      s3: '/s3',
      rds: '/rds',
      dynamodb: '/dynamodb',
      iam: '/iam',
      ec2: '/ec2',
      apigateway: '/apigateway'
    }
  },
  GCP: {
    domain: 'console.cloud.google.com',
    services: {
      'cloud-run': '/run',
      firestore: '/firestore',
      'app-engine': '/appengine',
      'cloud-storage': '/storage',
      'cloud-functions': '/functions'
    }
  },
  Azure: {
    domain: 'portal.azure.com',
    services: {
      'app-service': '/resource',
      'cosmos-db': '/resource',
      'sql-database': '/resource'
    }
  },
  Firebase: {
    domain: 'console.firebase.google.com',
    services: {
      firestore: '/firestore',
      functions: '/functions',
      hosting: '/hosting'
    }
  },
  Heroku: {
    domain: 'dashboard.heroku.com',
    services: {
      dyno: '/apps'
    }
  }
};

export class PageDetectionService {
  /**
   * Detect current cloud platform and service from URL
   */
  detectFromUrl(url: string): PageDetectionResult | null {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathname = urlObj.pathname;

    // Check AWS
    if (hostname.includes('console.aws.amazon.com')) {
      const service = this.detectAWSService(pathname);
      return {
        currentPage: url,
        cloudPlatform: 'AWS',
        pageType: service || 'dashboard',
        suggestedService: service ? (`aws-${service}` as any) : undefined
      };
    }

    // Check GCP
    if (hostname.includes('console.cloud.google.com')) {
      const service = this.detectGCPService(pathname);
      return {
        currentPage: url,
        cloudPlatform: 'GCP',
        pageType: service || 'dashboard',
        suggestedService: service ? (`gcp-${service}` as any) : undefined
      };
    }

    // Check Firebase
    if (hostname.includes('console.firebase.google.com')) {
      const service = this.detectFirebaseService(pathname);
      return {
        currentPage: url,
        cloudPlatform: 'Firebase',
        pageType: service || 'dashboard',
        suggestedService: service ? (`firebase-${service}` as any) : undefined
      };
    }

    // Check Azure
    if (hostname.includes('portal.azure.com')) {
      return {
        currentPage: url,
        cloudPlatform: 'Azure',
        pageType: this.detectAzureService(pathname) || 'dashboard',
        suggestedService: undefined
      };
    }

    // Check Heroku
    if (hostname.includes('dashboard.heroku.com')) {
      return {
        currentPage: url,
        cloudPlatform: 'Heroku',
        pageType: 'apps',
        suggestedService: 'heroku-dyno' as any
      };
    }

    return null;
  }

  /**
   * Detect AWS service from pathname
   */
  private detectAWSService(pathname: string): string | null {
    const services = CLOUD_SERVICE_URLS.AWS.services;
    for (const [service, path] of Object.entries(services)) {
      if (pathname.includes(path)) {
        return service;
      }
    }
    return null;
  }

  /**
   * Detect GCP service from pathname
   */
  private detectGCPService(pathname: string): string | null {
    const services = CLOUD_SERVICE_URLS.GCP.services;
    for (const [service, path] of Object.entries(services)) {
      if (pathname.includes(path)) {
        return service;
      }
    }
    return null;
  }

  /**
   * Detect Firebase service from pathname
   */
  private detectFirebaseService(pathname: string): string | null {
    const services = CLOUD_SERVICE_URLS.Firebase.services;
    for (const [service, path] of Object.entries(services)) {
      if (pathname.includes(path)) {
        return service;
      }
    }
    return null;
  }

  /**
   * Detect Azure service from pathname
   */
  private detectAzureService(pathname: string): string | null {
    if (pathname.includes('Microsoft.Web')) return 'app-service';
    if (pathname.includes('Microsoft.DocumentDB')) return 'cosmos-db';
    if (pathname.includes('Microsoft.Sql')) return 'sql-database';
    return null;
  }

  /**
   * Extract DOM information from the current page
   */
  getPageDOM(): any {
    return {
      title: document.title,
      url: window.location.href,
      formFields: this.extractFormFields(),
      buttons: this.extractButtons()
    };
  }

  /**
   * Extract form fields from the page
   */
  private extractFormFields(): any[] {
    const fields: any[] = [];
    const inputs = document.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
      const element = input as HTMLInputElement;
      fields.push({
        id: element.id,
        name: element.name,
        type: element.type,
        label: this.findLabelForInput(element),
        placeholder: element.placeholder,
        required: element.required
      });
    });

    return fields;
  }

  /**
   * Find label for input element
   */
  private findLabelForInput(input: HTMLInputElement): string {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) {
      return label.textContent || '';
    }

    const parent = input.closest('label');
    if (parent) {
      return parent.textContent || '';
    }

    return '';
  }

  /**
   * Extract buttons from the page
   */
  private extractButtons(): any[] {
    const buttons: any[] = [];
    const btnElements = document.querySelectorAll('button, a[role="button"]');

    btnElements.forEach(btn => {
      buttons.push({
        text: btn.textContent,
        type: btn instanceof HTMLButtonElement ? btn.type : 'link',
        class: btn.className
      });
    });

    return buttons;
  }
}

export const pageDetectionService = new PageDetectionService();
