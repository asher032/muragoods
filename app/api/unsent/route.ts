import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import UnsentLetter from '@/app/lib/models/UnsentLetter';

// POST — Submit a new unsent letter
export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { authorEmail, authorName, recipientName, content, category } = body;

    if (!authorEmail || !recipientName || !content) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ success: false, error: 'Letter must be under 2000 characters' }, { status: 400 });
    }
    if (recipientName.trim().length < 1) {
      return NextResponse.json({ success: false, error: 'Please enter a recipient name' }, { status: 400 });
    }

    const letter = await UnsentLetter.create({
      authorEmail,
      authorName: authorName || 'Anonymous',
      recipientName: recipientName.trim(),
      content: content.trim(),
      category: category || 'Other',
    });

    return NextResponse.json({ success: true, data: letter }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// GET — Search, browse, or fetch user's submissions
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const name = searchParams.get('name');
    const email = searchParams.get('email');
    const category = searchParams.get('category');
    const sort = searchParams.get('sort') || 'newest';
    const random = searchParams.get('random') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // My submissions
    if (email && !name) {
      const letters = await UnsentLetter.find({ authorEmail: email }).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: letters });
    }

    // Build query
    const query: Record<string, unknown> = { approved: true };
    if (name) {
      query.recipientName = { $regex: new RegExp(name.trim(), 'i') };
    }
    if (category && category !== 'All') {
      query.category = category;
    }

    // Random
    if (random) {
      const count = await UnsentLetter.countDocuments(query);
      if (count === 0) return NextResponse.json({ success: true, data: [] });
      const randomLetters = await UnsentLetter.aggregate([
        { $match: query },
        { $sample: { size: Math.min(10, count) } },
      ]);
      return NextResponse.json({ success: true, data: randomLetters });
    }

    // Sort
    const sortOption: Record<string, 1 | -1> = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const skip = (page - 1) * limit;
    const letters = await UnsentLetter.find(query).sort(sortOption).skip(skip).limit(limit);
    const total = await UnsentLetter.countDocuments(query);

    return NextResponse.json({ success: true, data: letters, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH — Like, bookmark, or approve
export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { id, action, email } = body;

    if (!id || !action) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const letter = await UnsentLetter.findById(id);
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
    }

    if (action === 'like' && email) {
      const alreadyLiked = letter.likedBy.includes(email);
      if (alreadyLiked) {
        letter.likedBy = letter.likedBy.filter((e: string) => e !== email);
        letter.likes = Math.max(0, letter.likes - 1);
      } else {
        letter.likedBy.push(email);
        letter.likes += 1;
      }
      await letter.save();
      return NextResponse.json({ success: true, data: letter, liked: !alreadyLiked });
    }

    if (action === 'bookmark' && email) {
      const alreadyBookmarked = letter.bookmarkedBy.includes(email);
      if (alreadyBookmarked) {
        letter.bookmarkedBy = letter.bookmarkedBy.filter((e: string) => e !== email);
        letter.bookmarks = Math.max(0, letter.bookmarks - 1);
      } else {
        letter.bookmarkedBy.push(email);
        letter.bookmarks += 1;
      }
      await letter.save();
      return NextResponse.json({ success: true, data: letter, bookmarked: !alreadyBookmarked });
    }

    if (action === 'approve') {
      letter.approved = true;
      await letter.save();
      return NextResponse.json({ success: true, data: letter });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE — Delete a submission
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const email = searchParams.get('email');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    // Only allow author to delete their own
    const letter = await UnsentLetter.findById(id);
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    if (email && letter.authorEmail !== email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    await UnsentLetter.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
