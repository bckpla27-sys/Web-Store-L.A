export type AccountRole = 'CUSTOMER' | 'OWNER';
export type AccountType = 'PERMANENT' | 'TRIAL';
export type PaymentConfirmationStatus =
  | 'PENDING_OWNER'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED';

export interface PackageOption {
  id: 'trial_3h' | 'trial_10h' | 'trial_24h' | 'permanent' | 'vip_permanent';
  name: string;
  subtitle: string;
  price: number;
  originalPrice?: number;
  badge?: string;
  accountType: AccountType;
  durationHours: number; // 0 for PERMANENT
  durationLabel: string;
  features: string[];
}

export interface FastLoginUserInput {
  userId?: string;
  username: string;
  password?: string;
  role?: AccountRole | string;
  accountType?: AccountType | string;
  trialExpiresAt?: number;
}

export interface BuyerOrder {
  id: string;
  queueNumber: string; // Contoh: "#LA-4829"
  userId: string;
  createdAt: number;
  createdAtFormatted: string;
  packageId: PackageOption['id'];
  packageName: string;
  price: number;
  accountType: AccountType;
  role: AccountRole;
  durationHours: number;
  trialExpiresAt: number; // 0 for PERMANENT, timestamp ms for TRIAL
  username: string;
  password: string;
  whatsapp?: string;
  email?: string;
  fastKey: string;
  paymentProofBase64: string;
  paymentStatus: PaymentConfirmationStatus;
  paymentVerificationNote?: string;
  approvalSignature?: string;
  syncedToFirebase: boolean;
  emailNotified?: boolean;
  emailNotificationStatus?: string;
}

export interface GiveawayParticipant {
  id: string;
  ticketNumber: string; // Contoh: "#GW-7821"
  fullName: string;
  tiktokAccount: string; // @namatiktok
  proofBase64: string;
  createdAt: number;
  createdAtFormatted: string;
  status: 'WAITING_DRAW' | 'WINNER' | 'NOT_SELECTED';
  isWinner: boolean;
  drawnAt?: number;
}

export interface EmailNotificationSettings {
  adminEmail: string;
  autoEmailEnabled: boolean;
  provider: 'emailjs' | 'gmail_relay';
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
}

export interface StoreSettings {
  danaNumber: string;
  danaAccountName: string;
  qrCodeBase64: string;
  firebaseDbUrl: string;
  ownerUsername: string;
  ownerPasswordHash: string;
  emailSettings: EmailNotificationSettings;
  updatedAt: number;
}
