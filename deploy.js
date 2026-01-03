// Deployment script for Lost & Found PWA
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting Lost & Found PWA deployment...');

// Create necessary directories
const dirs = [
  'dist',
  'uploads',
  'public/icons'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Create placeholder icons
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconDir = 'public/icons';

iconSizes.forEach(size => {
  const iconPath = path.join(iconDir, `icon-${size}x${size}.png`);
  if (!fs.existsSync(iconPath)) {
    // Create a simple SVG icon and convert to PNG (placeholder)
    const svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${size}" height="${size}" fill="#2563eb" rx="20"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white" font-size="${size * 0.4}" font-family="Arial">LF</text>
      </svg>
    `;
    
    // For demo purposes, create a simple text file as placeholder
    fs.writeFileSync(iconPath, `<!-- ${size}x${size} icon placeholder -->`);
    console.log(`🎨 Created icon placeholder: ${iconPath}`);
  }
});

// Build the application
try {
  console.log('🔨 Building application...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build completed successfully');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

// Copy additional files to dist
const filesToCopy = [
  { src: 'public/manifest.json', dest: 'dist/manifest.json' },
  { src: 'public/sw.js', dest: 'dist/sw.js' },
  { src: 'public/icons', dest: 'dist/icons' }
];

filesToCopy.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    if (fs.lstatSync(src).isDirectory()) {
      execSync(`cp -r ${src} ${path.dirname(dest)}/`);
    } else {
      fs.copyFileSync(src, dest);
    }
    console.log(`📋 Copied: ${src} → ${dest}`);
  }
});

// Create production environment file
const envContent = `
# Production Environment Variables
NODE_ENV=production
PORT=3000
JWT_SECRET=${generateSecretKey()}
CLIENT_URL=https://your-domain.com

# Database Configuration (replace with your database)
# DATABASE_URL=your-database-connection-string

# Cloud Storage (replace with your storage)
# CLOUDINARY_URL=your-cloudinary-url
# AWS_ACCESS_KEY_ID=your-aws-key
# AWS_SECRET_ACCESS_KEY=your-aws-secret

# Push Notifications
# VAPID_PUBLIC_KEY=your-vapid-public-key
# VAPID_PRIVATE_KEY=your-vapid-private-key

# Analytics
# GOOGLE_ANALYTICS_ID=your-ga-id
`;

fs.writeFileSync('.env.production', envContent.trim());
console.log('🔧 Created production environment file');

// Create Docker configuration
const dockerfileContent = `
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start application
CMD ["npm", "start"]
`;

fs.writeFileSync('Dockerfile', dockerfileContent.trim());
console.log('🐳 Created Dockerfile');

// Create docker-compose for development
const dockerComposeContent = `
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=your-jwt-secret-here
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Uncomment to add database
  # db:
  #   image: postgres:15-alpine
  #   environment:
  #     POSTGRES_DB: lostfound
  #     POSTGRES_USER: lostfound
  #     POSTGRES_PASSWORD: your-password-here
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data
  #   restart: unless-stopped

# volumes:
#   postgres_data:
`;

fs.writeFileSync('docker-compose.yml', dockerComposeContent.trim());
console.log('🐳 Created docker-compose.yml');

// Create deployment README
const deploymentReadme = `
# Lost & Found PWA Deployment Guide

## Quick Start

### Local Development
\`\`\`bash
npm install
npm run dev
\`\`\`

### Production Build
\`\`\`bash
npm run build
npm start
\`\`\`

### Docker Deployment
\`\`\`bash
docker-compose up -d
\`\`\`

## Environment Configuration

1. Copy \`.env.production\` to \`.env\`
2. Update environment variables with your values
3. Configure database connection
4. Set up cloud storage (optional)
5. Configure push notifications (optional)

## Features Included

✅ **Core Features**
- Multi-tenant Lost & Found system
- AI-powered item matching
- Real-time notifications
- User authentication (email, Google, guest)
- Image upload and processing
- Offline functionality
- Progressive Web App (PWA)

✅ **Advanced Features**
- Real-time cost analytics
- Admin dashboard
- Geolocation tracking
- Message system
- Analytics and insights
- Responsive design
- Dark mode support

✅ **Technical Features**
- Serverless architecture ready
- Edge computing support
- Background sync
- Service worker caching
- Push notifications
- Rate limiting
- Security headers

## Default Credentials

**Admin Account:**
- Email: admin@lostfound.com
- Password: admin123

## API Endpoints

- \`GET /\` - Main application
- \`POST /api/auth/login\` - User login
- \`POST /api/auth/register\` - User registration
- \`GET /api/items\` - List items
- \`POST /api/items\` - Create item
- \`GET /api/dashboard/summary\` - Dashboard data
- \`POST /api/analytics/events\` - Analytics tracking

## Deployment Options

### 1. Vercel (Recommended)
\`\`\`bash
npm install -g vercel
vercel
\`\`\`

### 2. Netlify
\`\`\`bash
npm install -g netlify-cli
netlify deploy --prod
\`\`\`

### 3. Railway
\`\`\`bash
npm install -g @railway/cli
railway deploy
\`\`\`

### 4. Heroku
\`\`\`bash
heroku create your-app-name
git push heroku main
\`\`\`

### 5. DigitalOcean App Platform
- Connect your GitHub repository
- Configure build settings
- Deploy automatically

## Performance Optimizations

- Service Worker caching
- Image optimization with Sharp
- Gzip compression
- Rate limiting
- CDN-ready static assets
- Lazy loading
- Code splitting

## Security Features

- JWT authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation
- File upload restrictions

## Monitoring & Analytics

- Real-time cost tracking
- User behavior analytics
- Performance monitoring
- Error tracking
- Custom metrics

## Support

For issues and questions:
1. Check the documentation
2. Review the code comments
3. Test with sample data
4. Verify environment configuration

## License

MIT License - Feel free to use and modify for your needs.
`;

fs.writeFileSync('DEPLOYMENT.md', deploymentReadme.trim());
console.log('📖 Created deployment documentation');

// Update package.json scripts
const packageJsonPath = 'package.json';
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  packageJson.scripts = {
    ...packageJson.scripts,
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "node deploy.js",
    "docker:build": "docker build -t lost-found-pwa .",
    "docker:run": "docker run -p 3000:3000 lost-found-pwa",
    "docker:compose": "docker-compose up -d"
  };
  
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  console.log('📦 Updated package.json scripts');
}

console.log('\n🎉 Deployment preparation completed!');
console.log('\n📋 Next steps:');
console.log('1. Install dependencies: npm install');
console.log('2. Configure environment: cp .env.production .env');
console.log('3. Start development: npm run dev');
console.log('4. Build for production: npm run build');
console.log('5. Deploy: npm start');
console.log('\n🌐 The app will be available at http://localhost:3000');
console.log('👤 Admin login: admin@lostfound.com / admin123');

function generateSecretKey() {
  return require('crypto').randomBytes(64).toString('hex');
}