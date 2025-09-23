import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(10),
  ALLOWED_EMAIL_DOMAIN: z.string().min(3),
  PIPEDRIVE_API_TOKEN: z.string().min(5),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(2),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1)
});

export const env = Env.parse(process.env);
