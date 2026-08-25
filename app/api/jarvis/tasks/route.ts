import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JarvisTask from '@/app/lib/models/JarvisTask';

// GET: List tasks for a user
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const status = searchParams.get('status');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
    }

    const query: Record<string, unknown> = { userId };
    if (status) query.status = status;

    const tasks = await JarvisTask.find(query).sort({ createdAt: -1 }).limit(50);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST: Create a new task
export async function POST(req: Request) {
  try {
    await dbConnect();
    const { userId, title, description, type } = (await req.json()) as {
      userId: string; title: string; description?: string; type?: string;
    };

    if (!userId || !title) {
      return NextResponse.json({ success: false, error: 'userId and title required' }, { status: 400 });
    }

    const task = await JarvisTask.create({
      userId,
      title,
      description: description || '',
      type: type || 'system',
      status: 'queued',
      logs: [{ step: 'Task created', status: 'completed', message: 'Queued for execution' }],
    });

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH: Update a task (status, logs, result)
export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const { taskId, userId, status, log, result } = (await req.json()) as {
      taskId: string; userId: string; status?: string;
      log?: { step: string; status: string; message: string }; result?: string;
    };

    if (!taskId || !userId) {
      return NextResponse.json({ success: false, error: 'taskId and userId required' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (status) {
      update.status = status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        update.completedAt = new Date();
      }
    }
    if (result) update.result = result;
    if (log) {
      update.$push = { logs: { ...log, timestamp: new Date() } };
    }

    const task = await JarvisTask.findOneAndUpdate(
      { _id: taskId, userId },
      update,
      { new: true }
    );

    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE: Clear all tasks
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
    }

    await JarvisTask.deleteMany({ userId });
    return NextResponse.json({ success: true, message: 'All tasks cleared' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
