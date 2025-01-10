## ChatGauntlet Deployment Guide

### 1. Environment Variables Setup
- [x] Add `NEXTAUTH_SECRET` to Render environment variables
- [x] Add production `NEXTAUTH_URL` (e.g., `https://your-app.onrender.com`)

### 2. Database Setup
1. Create Production PostgreSQL Database
   - Go to Render Dashboard
   - Click "New +" → Select "PostgreSQL"
   - Configure database settings:
     - Choose a name (e.g., `chatgauntlet-prod-db`)
     - Select region closest to your users
     - Choose appropriate instance type

2. Configure Database Connection
   - Copy the provided PostgreSQL connection string
   - Add it as `DATABASE_URL` in Render web service environment variables

3. Database Migration
   - Ensure build command includes:
     ```bash
     npx prisma generate && npx prisma migrate deploy && npm run build
     ```

### 3. Additional Environment Variables
Make sure all other environment variables are set in production:
- [ ] AWS_ACCESS_KEY_ID (Required for file uploads)
- [ ] AWS_SECRET_ACCESS_KEY (Required for file uploads)
- [ ] AWS_REGION (Required for file uploads)
- [ ] AWS_BUCKET_NAME (Required for file uploads)

### 4. AWS S3 Configuration
1. Configure CORS for S3 Bucket
   - Go to AWS S3 Console
   - Select your bucket (`chatgeniusbucket563`)
   - Go to "Permissions" tab
   - Find "Cross-origin resource sharing (CORS)"
   - Add CORS configuration:
     ```json
     [
         {
             "AllowedHeaders": ["*"],
             "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
             "AllowedOrigins": [
                 "http://localhost:3000",
                 "http://localhost:3001",
                 "https://chatgauntlet.onrender.com"
             ],
             "ExposeHeaders": ["ETag"],
             "MaxAgeSeconds": 3600
         }
     ]
     ```
   - Note: Keep the development URLs for local testing

### 5. Deployment Checklist
- [x] Verify all environment variables are set
- [x] Ensure database migrations run successfully
- [x] Test user registration flow
- [x] Test authentication flow
- [ ] Verify file uploads work with AWS S3
- [ ] Check all API endpoints are functioning

### 6. Monitoring and Maintenance
- Set up logging and monitoring
- Keep track of database performance
- Monitor AWS S3 usage
- Regular backups of production database

### Notes
- Keep development and production databases separate
- Never expose sensitive credentials in code or version control
- Regularly update dependencies and security patches
- Monitor application logs for errors and issues 