# HC Violins and Bows - Inventory Management System

A modern, full-stack inventory management system for violin and bow dealers, built with Next.js 14, TypeScript, and Supabase.

## 🚀 Features

- **Complete CRUD Operations** for clients, instruments, and connections
- **Real-time Data Synchronization** with Supabase
- **Advanced Filtering & Search** capabilities
  - Calendar search with multi-field support (task title, instrument name/serial, client name)
  - Tag-based filters (type, priority, status, ownership)
  - Search result highlighting
  - Sorting (date, priority, status, type)
- **Maintenance Calendar** with multiple views (month, week, day, year, timeline)
- **Responsive Design** with Tailwind CSS
- **Type-safe** with TypeScript
- **Comprehensive Testing** with Jest and Playwright
- **CI/CD Pipeline** with GitHub Actions

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 19, TypeScript
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Styling**: Tailwind CSS
- **Testing**: Jest, Testing Library, Playwright
- **Code Quality**: ESLint, Prettier, Husky
- **Deployment**: Vercel

## 📋 Prerequisites

- Node.js 20.x (specified in `.nvmrc` and `package.json`)
- npm or yarn
- Supabase account

## 🚀 Getting Started

1. **Clone the repository**

```bash
git clone <repository-url>
cd HC-Violins-and-Bows
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp env.template .env.local
# Edit .env.local with your Supabase credentials
# Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_PASSWORD
```

4. **Set up the database**

데이터베이스 마이그레이션은 [마이그레이션 가이드](./docs/migrations/README.md)를 참조하세요.

```bash
# Check current database schema
npm run schema:check

# Run migrations (see docs/migrations/README.md for details)
```

5. **Run the development server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🔧 Development

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Fix ESLint errors
npm run test         # Run unit tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run test:e2e     # Run E2E tests
npm run type-check   # Run TypeScript type checking
npm run schema:check # Check database schema
npm run migrate:subtype # Run subtype migration
```

### Pre-commit Hooks

This project uses Husky and lint-staged for pre-commit hooks:

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking
- **Tests** - Run relevant tests

### Code Quality

- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Husky** - Git hooks
- **lint-staged** - Pre-commit linting

## 🚀 CI/CD Pipeline

### GitHub Actions Workflows

1. **CI Pipeline** (`.github/workflows/ci.yml`)
   - Runs on push/PR to main/develop branches
   - Tests, linting, type checking
   - Build verification
   - E2E tests
   - Auto-deploy to Vercel

2. **Security Scan** (`.github/workflows/security.yml`)
   - Weekly security scans
   - npm audit
   - Snyk vulnerability scanning

3. **Code Quality** (`.github/workflows/code-quality.yml`)
   - ESLint, Prettier checks
   - SonarCloud integration
   - Type checking

### Required Secrets

Add these secrets to your GitHub repository:

```
VERCEL_TOKEN=your_vercel_token
ORG_ID=your_vercel_org_id
PROJECT_ID=your_vercel_project_id
SNYK_TOKEN=your_snyk_token (optional)
SONAR_TOKEN=your_sonarcloud_token (optional)
```

## 🧪 Testing

### Unit Tests

```bash
npm run test
npm run test:coverage
```

### E2E Tests

```bash
npm run test:e2e                  # Chromium-only
npm run test:e2e:invoice-settings # Chromium-only smoke
npm run test:e2e:install          # Install all configured Playwright browsers
npm run test:e2e:all-browsers     # Requires installed Firefox/WebKit projects
npm run test:e2e:ui
```

### Test Coverage

The project maintains high test coverage with:

- Component testing with Testing Library
- Hook testing
- Utility function testing
- E2E testing with Playwright

## 📦 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically via GitHub Actions

### Manual Deployment

```bash
npm run build
npm run start
```

자세한 배포 가이드는 [프로덕션 배포 가이드](./docs/DEPLOYMENT.md)를 참조하세요.

## 🏗️ Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── clients/           # Client management
│   ├── dashboard/         # Main dashboard
│   ├── form/              # Connection forms
│   ├── instruments/       # Instrument management
│   └── layout.tsx         # Root layout
├── components/            # Reusable components
│   ├── common/           # Common UI components
│   └── layout/           # Layout components
├── contexts/             # React contexts
├── hooks/                # Custom hooks
├── lib/                  # External libraries
├── types/                # TypeScript types
└── utils/                # Utility functions
```

## 📚 Documentation

프로젝트의 상세한 문서는 [docs 폴더](./docs/README.md)를 참조하세요.

### 주요 문서

- [마이그레이션 가이드](./docs/migrations/README.md) - 데이터베이스 마이그레이션
- [프로덕션 배포 가이드](./docs/DEPLOYMENT.md) - 배포 준비 및 실행
- [데이터베이스 마이그레이션 가이드](./docs/DATABASE_MIGRATION.md) - 데이터베이스 설정
- [캘린더 설정 가이드](./docs/CALENDAR_SETUP_GUIDE.md) - 캘린더 기능 설정
- [기능 완성도 분석](./docs/FEATURE_COMPLETION_ANALYSIS.md) - 기능 상태 분석
- [품질 리포트](./docs/QUALITY_REPORT.md) - 프로젝트 품질 평가

전체 문서 목록은 [문서 인덱스](./docs/README.md)를 확인하세요.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Use conventional commit messages
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the MIT License.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
