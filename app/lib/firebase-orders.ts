import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Order } from './muragoods-data';

// Create a new order
export async function createOrder(
  userId: string,
  orderData: Omit<Order, 'id' | 'createdAt'>
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'orders'), {
      ...orderData,
      userId,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
}

// Get all orders for a user
export async function getUserOrders(userId: string): Promise<Order[]> {
  try {
    const q = query(collection(db, 'orders'), where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    } as Order));
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

// Get all orders (admin only)
export async function getAllOrders(): Promise<(Order & { userId: string })[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'orders'));
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      userId: doc.data().userId,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    } as Order & { userId: string }));
  } catch (error) {
    console.error('Error fetching all orders:', error);
    return [];
  }
}

// Update order status
export async function updateOrderStatus(
  orderId: string,
  newStatus: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      status: newStatus,
    });
  } catch (error) {
    console.error('Error updating order:', error);
    throw error;
  }
}

// Delete order
export async function deleteOrder(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'orders', orderId));
  } catch (error) {
    console.error('Error deleting order:', error);
    throw error;
  }
}

// Clear all orders for a user
export async function clearUserOrders(userId: string): Promise<void> {
  try {
    const orders = await getUserOrders(userId);
    for (const order of orders) {
      await deleteOrder(order.id);
    }
  } catch (error) {
    console.error('Error clearing orders:', error);
    throw error;
  }
}
