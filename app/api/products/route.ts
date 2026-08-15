import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Product from '@/app/lib/models/Product';

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('id');
    const body = await req.json();

    if (!productId) {
      return NextResponse.json({ success: false, error: 'Product ID is required' }, { status: 400 });
    }

    const product = await Product.findByIdAndUpdate(productId, body, { new: true });
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
