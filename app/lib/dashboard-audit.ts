import dbConnect from '@/app/lib/mongodb';
import mongoose from 'mongoose';

// Config audit trail — stored in the raw collection (schema-free summaries).
// Shared by the dashboard config PATCH route and the audit viewer API.

export async function auditConfigChange(guildId: string, actor: string, summary: string) {
  await dbConnect();
  const col = mongoose.connection.collection('config_audit');
  await col.insertOne({
    guildId,
    actor: actor.slice(0, 60),
    summary: summary.slice(0, 300),
    at: new Date(),
  });
}
