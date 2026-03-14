# Job Application State Machine

A production-ready NestJS application that manages job applications through a strict state machine alongside automated audit logging, role-based access control (RBAC), and transactional integrity using PostgreSQL & Prisma. 

## Features
- **State Machine Engine**: strictly validates the lifecycle of job applications (`APPLIED` -> `INTERVIEWING` -> `CONTRACTED` -> `COMPLETED`).
- **Audit Logging**: Logs every change atomically using Prisma Transactions (`StatusHistory` table).
- **Security Check**: Enforces role access strictly using a custom `RolesGuard` and JWT Bearer tokens.
- **Authentication**: JWT-based login system with hashed passwords using `bcrypt`.
- **Email Notifications**: Seamless Resend integration with exponential backoff fault-tolerance.
- **API Documentation**: Automated via OpenAPI Swagger interface with Bearer Auth support.

## Security & Authentication
The API uses **JWT Bearer Authentication**. To access protected endpoints, you must first login and obtain a token.

### Default Users
The application automatically seeds the following users on startup:
- **Admin**: `admin@example.com` / `admin123`
- **Company**: `company@example.com` / `company123`
- **Candidate**: `candidate@example.com` / `candidate123`

### Authentication Flow
1. **Login**: POST `/api/auth/login` with email and password.
2. **Retrieve Token**: Copy the `access_token` from the response.
3. **Authorize**: Use the token in the `Authorization` header as `Bearer <token>`.

## Job Applications
- **Creation**: Restricted to the `CANDIDATE` role.
- **Auto-Identity**: Candidate name and email are pulled from the JWT token automatically. No need to provide them in the request.
- **Unique Constraint**: A user can only have one active application per `TechRole`.
- **Tech Roles**: 
  - `BACKEND_ENGINEER`
  - `FRONTEND_ENGINEER`
  - `FULLSTACK_ENGINEER`
  - `DEVOPS_ENGINEER`
  - `DATA_SCIENTIST`

## State Transitions 
- **APPLIED -> INTERVIEWING** (Requires ADMIN or COMPANY)
- **INTERVIEWING -> CONTRACTED** (Requires ADMIN or COMPANY).
- **CONTRACTED -> COMPLETED** (Requires ADMIN or COMPANY)
- **Any State -> CLOSED** 

## Setup Instructions

### Environment Variables
Duplicate `.env.example` into a `.env`. Make sure you substitute the required values:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=no-reply@example.com
```

### Database Setup
To initialize the structures in your database instance simply use Prisma's direct push or dev pipeline mappings:
```sh
npm install
npx prisma db push
```

## Running the App

```sh
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Running Tests
Run the test command directly for coverage reports:
```sh
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e
```

## API Requests Reference & Documentation
A fully loaded Swagger dashboard can be accessed directly on your server host:
**http://localhost:3000/api/docs**

### Testing Manually (Postman)
A Postman collection is heavily documented and mapped to the existing server config path out the box. 
**File**: Locate `postman/job-application-api.postman_collection.json` inside the repository structure. Simply drag/drop inside Postman or navigate `Import` > Selected File.
