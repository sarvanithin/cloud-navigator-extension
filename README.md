# Cloud Navigator Extension 🌩️

An intelligent Chrome extension that analyzes your GitHub codebase and guides you step-by-step through setting up cloud services.

## Overview

Cloud Navigator bridges the gap between developers and cloud platforms. It:

1. **Analyzes** your GitHub codebase to detect cloud service dependencies
2. **Recommends** the optimal cloud services needed for your project
3. **Guides** you through cloud service setup with real-time, context-aware instructions
4. **Provides** smart defaults and best practices for your use case

No cloud expertise required! The extension walks you through every step.

## Key Features

✨ **Intelligent Code Analysis**
- Analyzes dependencies (package.json, requirements.txt, etc.)
- Scans for cloud service SDK patterns
- Detects framework and technology usage

🎯 **Smart Recommendations**
- Identifies which cloud services you need
- Provides recommended setup order
- Prioritizes services that others depend on

🗺️ **Real-Time Guidance**
- Monitors cloud service pages you're visiting
- Injects contextual help and tooltips
- Highlights form fields with suggestions
- Shows step-by-step setup instructions

☁️ **Multi-Cloud Support**
- AWS (Lambda, S3, RDS, DynamoDB, IAM, API Gateway, etc.)
- Google Cloud Platform (Cloud Run, Firestore, Cloud Storage, etc.)
- Microsoft Azure (App Service, Cosmos DB, etc.)
- Firebase (Firestore, Cloud Functions, Hosting)
- Heroku

## Project Structure

```
cloud-navigator-extension/
├── src/
│   ├── popup/              # Main extension UI (React)
│   ├── content/            # Content script for cloud service pages
│   ├── background/         # Service worker
│   ├── services/           # Core logic
│   │   ├── github.ts       # GitHub API integration
│   │   ├── codebaseAnalyzer.ts  # Code analysis engine
│   │   ├── pageDetection.ts     # Cloud page detection
│   │   └── smartDefaults.ts     # Service configurations
│   ├── types/              # TypeScript type definitions
│   ├── styles/             # CSS stylesheets
│   └── utils/              # Utility functions
├── public/                 # Static assets
│   ├── manifest.json       # Chrome extension config
│   ├── popup.html          # Popup UI
│   ├── content.css         # Content script styles
│   └── icons/              # Extension icons
├── webpack.config.js       # Build configuration
├── tsconfig.json           # TypeScript config
├── package.json            # Dependencies
└── README.md              # This file
```

## Installation & Setup

### Prerequisites
- Node.js 16+ and npm
- GitHub account
- Chrome browser

### Step 1: Clone Repository
```bash
git clone https://github.com/your-username/cloud-navigator-extension.git
cd cloud-navigator-extension
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment
```bash
cp .env.example .env
# Edit .env and add your GitHub OAuth credentials
```

### Step 4: Register GitHub OAuth App
1. Go to https://github.com/settings/applications/new
2. Fill in the form:
   - Application name: "Cloud Navigator"
   - Homepage URL: `chrome-extension://YOUR_EXTENSION_ID/`
   - Authorization callback URL: `https://YOUR_EXTENSION_ID.chromiumapp.org/`
3. Copy the Client ID to your `.env` file

### Step 5: Build Extension
```bash
npm run build
```

### Step 6: Load in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `dist/` folder from this project

## Usage

### 1. Analyze Your Repository
1. Click the Cloud Navigator extension icon
2. Click "Connect GitHub"
3. Authorize the application
4. Select a repository from your list
5. Wait for analysis to complete

### 2. View Recommendations
After analysis, you'll see:
- Detected cloud services
- Confidence scores for each service
- Evidence (dependencies, patterns found)
- Recommended setup order

### 3. Setup with Guidance
1. Click "Setup These Services"
2. Navigate to your cloud provider's console
3. The extension provides real-time guidance:
   - Highlighted form fields
   - Smart default values
   - Step-by-step instructions
   - Best practice tips

### 4. Real-Time Guidance Features
While on AWS/GCP/Azure/Firebase pages:

- **Sidebar Panel**: Shows complete setup instructions
- **Form Highlighting**: Important fields are highlighted
- **Smart Defaults**: Suggested values appear for each field
- **Helper Bubble**: Click to open/close guidance panel
- **Context Tooltips**: Hover over fields for help

## Service Detection

### How It Works
The analyzer uses two methods:

1. **Dependency Analysis**
   - Scans `package.json`, `requirements.txt`, `Gemfile`, etc.
   - Matches against known cloud service SDKs
   - Fast and reliable

2. **Code Pattern Detection**
   - Searches for API calls and SDK usage
   - Identifies configuration files
   - Detects environment variable patterns

### Supported Languages
- Node.js (JavaScript/TypeScript)
- Python
- Ruby
- Go
- Java
- C#/.NET

## Configuration & Smart Defaults

Each cloud service has pre-configured smart defaults:

### AWS Lambda
- Runtime: Node.js 18.x
- Memory: 256 MB
- Timeout: 30 seconds
- Suggested: Configure IAM role, set environment variables

### AWS S3
- Security: All public access blocked (recommended)
- Versioning: Enabled
- Encryption: Suggested

### GCP Cloud Run
- Memory: 256Mi
- CPU: 1
- Timeout: 300 seconds

See `src/services/smartDefaults.ts` for all service configurations.

## Development

### Adding a New Cloud Service

1. Add service type to `src/types/index.ts`:
```typescript
export type CloudService = 'my-new-service' | ...;
```

2. Add detection patterns in `src/services/codebaseAnalyzer.ts`:
```typescript
const SERVICE_PATTERNS = {
  'my-new-service': {
    dependencies: ['my-sdk', 'related-lib'],
    patterns: ['MyService', 'initClient'],
    language: ['nodejs', 'python']
  }
};
```

3. Add configuration in `src/services/smartDefaults.ts`:
```typescript
'my-new-service': {
  service: 'my-new-service',
  smartDefaults: { /* ... */ },
  requiredFields: ['field1', 'field2'],
  documentationUrl: 'https://...'
}
```

4. Add page detection in `src/services/pageDetection.ts`:
```typescript
if (hostname.includes('myservice.com')) {
  return {
    currentPage: url,
    cloudPlatform: 'MyPlatform',
    pageType: detectServiceType(pathname)
  };
}
```

### Build Commands
```bash
# Development (watch mode)
npm run dev

# Production build
npm run build

# Run tests (when added)
npm test
```

### Code Quality
```bash
# Format code (if prettier is added)
npm run format

# Lint (if eslint is added)
npm run lint
```

## Security & Privacy

🔒 **Privacy First**
- All code analysis happens locally in your browser
- No code is sent to external servers
- GitHub OAuth uses official GitHub API
- Cloud API keys are never stored in the extension

✅ **Best Practices**
- Uses Chrome Manifest V3 (latest standard)
- Implements content security policies
- Validates all user inputs
- Follows extension security guidelines

## Troubleshooting

### GitHub Authentication Issues
- Ensure your OAuth app is properly registered
- Check that redirect URLs match exactly
- Clear browser cache and try again

### Analysis Not Working
- Verify the repository is accessible to your GitHub account
- Check that dependencies files exist (package.json, etc.)
- Try re-analyzing

### Guidance Not Appearing
- Verify you're on a supported cloud service page
- Check browser console for errors
- Reload the page and try again

### Performance Issues
- Large repositories may take longer to analyze
- Use a faster internet connection
- Close unnecessary browser tabs

## Roadmap

### Phase 1: Foundation ✅
- [x] GitHub OAuth authentication
- [x] Codebase analysis engine
- [x] Cloud service detection
- [x] Basic popup UI
- [x] Page detection

### Phase 2: Guidance & UI 🚧
- [ ] Advanced form field recognition
- [ ] AI-powered help text generation
- [ ] Video tutorials for each service
- [ ] Progress tracking across sessions

### Phase 3: Automation
- [ ] Infrastructure-as-Code generation
- [ ] One-click resource creation (with confirmation)
- [ ] Configuration file generation

### Phase 4: Advanced Features
- [ ] Cost estimation based on recommended services
- [ ] Integration with cloud provider CLIs
- [ ] Custom service definitions
- [ ] Team collaboration features

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## Feedback & Issues

Found a bug? Have a suggestion? Please [open an issue](https://github.com/your-username/cloud-navigator-extension/issues).

## License

MIT License - See LICENSE file for details

---

Made with ☁️ and ❤️ to help developers navigate the cloud
