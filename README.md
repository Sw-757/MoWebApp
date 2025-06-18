# Core dependencies
npm install express ws wouter react react-dom @tanstack/react-query framer-motion

npm install drizzle-orm drizzle-zod zod

npm install @radix-ui/react-slot @radix-ui/react-toast @radix-ui/react-progress

npm install lucide-react class-variance-authority clsx tailwind-merge

npm install tailwindcss autoprefixer postcss

# Development dependencies
npm install -D @types/node @types/react @types/react-dom @types/express @types/ws

npm install -D @vitejs/plugin-react vite tsx typescript tailwindcss


{

  "scripts": {
  
    "dev": "NODE_ENV=development tsx server/index.ts",
    
    "build": "vite build",
    
    "start": "NODE_ENV=production tsx server/index.ts"
    
  }
  
}


npm run dev
