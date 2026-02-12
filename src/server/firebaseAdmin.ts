import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

const parseServiceAccount = (): ServiceAccount | null => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as ServiceAccount;
      if (!parsed.projectId || !parsed.clientEmail || !parsed.privateKey) {
        console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields');
        return null;
      }
      return {
        ...parsed,
        privateKey: parsed.privateKey.replace(/\\n/g, '\n'),
      };
    } catch (error) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON', error);
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
};

const hasApplicationDefaultCredentials = (): boolean => (
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim())
  || Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim())
  || Boolean(process.env.GCLOUD_PROJECT?.trim())
);

let cachedApp: App | null = null;
let initialized = false;

const getFirebaseApp = (): App | null => {
  if (cachedApp) return cachedApp;
  if (initialized) return null;
  initialized = true;

  const serviceAccount = parseServiceAccount();
  const hasAppDefault = hasApplicationDefaultCredentials();

  if (!serviceAccount && !hasAppDefault) {
    console.warn('Firebase messaging disabled: credentials are not configured');
    return null;
  }

  try {
    const app = getApps().length
      ? getApps()[0]
      : initializeApp({
        credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
      });
    cachedApp = app;
    return app;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK', error);
    return null;
  }
};

export const getFirebaseMessagingClient = (): Messaging | null => {
  const app = getFirebaseApp();
  if (!app) return null;

  try {
    return getMessaging(app);
  } catch (error) {
    console.error('Failed to resolve Firebase messaging client', error);
    return null;
  }
};

export const isFirebaseMessagingEnabled = (): boolean => Boolean(getFirebaseApp());
