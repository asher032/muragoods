import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITopUpOrder extends Document {
  // Order identification
  orderId: string;
  transactionId: string;

  // Game info
  gameId: string;
  gameName: string;
  gameIcon: string;

  // Account info (game-specific)
  accountDetails: Record<string, string>;

  // Package
  packageId: string;
  packageName: string;
  packageCurrency: string;
  packageAmount: number;

  // Pricing
  amount: number; // in PHP
  discount: number;
  finalAmount: number;

  // Customer
  customerEmail: string;
  customerName: string;
  customerPhone: string;

  // Payment
  paymentMethod: string;
  paymentStatus: 'pending' | 'processing' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refund_pending' | 'refund_processing' | 'refunded' | 'refund_failed';
  paymongoSessionId?: string;
  paymongoPaymentId?: string;
  paymentAttempts: number;

  // Top-up
  topUpStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'manual_review';
  topUpProviderRef?: string;
  topUpCompletedAt?: Date;

  // Retry
  retryOfOrderId?: string; // If this is a retry, reference the original
  retryCount: number;

  // Refund
  refundId?: string;
  refundAmount?: number;
  refundReason?: string;
  refundCompletedAt?: Date;

  // Admin notes
  adminNotes?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  paidAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  lastCheckedAt?: Date;
}

const TopUpOrderSchema = new Schema<ITopUpOrder>({
  orderId: { type: String, required: true, unique: true, index: true },
  transactionId: { type: String, required: true, unique: true, index: true },

  gameId: { type: String, required: true, index: true },
  gameName: { type: String, required: true },
  gameIcon: { type: String, required: true },

  accountDetails: { type: Schema.Types.Mixed, required: true },

  packageId: { type: String, required: true },
  packageName: { type: String, required: true },
  packageCurrency: { type: String, required: true },
  packageAmount: { type: Number, required: true },

  amount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },

  customerEmail: { type: String, required: true, index: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, default: '' },

  paymentMethod: { type: String, required: true },
  paymentStatus: { type: String, default: 'pending', index: true },
  paymongoSessionId: { type: String, index: true },
  paymongoPaymentId: { type: String },
  paymentAttempts: { type: Number, default: 1 },

  topUpStatus: { type: String, default: 'pending', index: true },
  topUpProviderRef: { type: String },
  topUpCompletedAt: { type: Date },

  retryOfOrderId: { type: String, index: true },
  retryCount: { type: Number, default: 0 },

  refundId: { type: String },
  refundAmount: { type: Number },
  refundReason: { type: String },
  refundCompletedAt: { type: Date },

  adminNotes: { type: String },

  paidAt: { type: Date },
  completedAt: { type: Date },
  failedAt: { type: Date },
  lastCheckedAt: { type: Date },
}, { timestamps: true });

const TopUpOrder: Model<ITopUpOrder> =
  mongoose.models.TopUpOrder || mongoose.model<ITopUpOrder>('TopUpOrder', TopUpOrderSchema);

export default TopUpOrder;
