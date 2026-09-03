// MuraStream — Library API Route
// Manages user watchlist, favorites, history, and progress
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import MuraStreamLibrary from '@/app/lib/murastream/models';

function getUserId(request: NextRequest): string {
  // Use cookie-based auth or session
  const userStr = request.cookies.get('user')?.value;
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      return user.email || user.id || 'anonymous';
    } catch { /* empty */ }
  }
  return 'anonymous';
}

// GET — Fetch user's library
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const userId = getUserId(request);
    let lib = await MuraStreamLibrary.findOne({ userId });
    if (!lib) {
      lib = await MuraStreamLibrary.create({ userId });
    }
    return NextResponse.json(lib);
  } catch (error) {
    console.error('Library GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 });
  }
}

// POST — Update library (add/remove from watchlist, favorites, etc.)
export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const userId = getUserId(request);
    const body = await request.json();
    const { action, item, key, value } = body;

    let lib = await MuraStreamLibrary.findOne({ userId });
    if (!lib) {
      lib = await MuraStreamLibrary.create({ userId });
    }

    switch (action) {
      case 'toggle-watchlist': {
        const exists = lib.watchlist.findIndex(
          (w: { id: number; mediaType: string }) => w.id === item.id && w.mediaType === item.mediaType
        );
        if (exists >= 0) {
          lib.watchlist.splice(exists, 1);
        } else {
          lib.watchlist.push({ ...item, addedAt: new Date() });
        }
        break;
      }
      case 'toggle-favorite': {
        const exists = lib.favorites.findIndex(
          (f: { id: number; mediaType: string }) => f.id === item.id && f.mediaType === item.mediaType
        );
        if (exists >= 0) {
          lib.favorites.splice(exists, 1);
        } else {
          lib.favorites.push({ ...item, addedAt: new Date() });
        }
        break;
      }
      case 'add-history': {
        // Deduplicate: for TV, dedupe by show+season+episode
        lib.history = lib.history.filter((h: { id: number; mediaType: string; season?: number; episode?: number }) => {
          if (h.id !== item.id || h.mediaType !== item.mediaType) return true;
          if (item.mediaType === 'tv') {
            return !(h.season === item.season && h.episode === item.episode);
          }
          return false;
        });
        lib.history.unshift({ ...item, watchedAt: new Date() });
        lib.history = lib.history.slice(0, 100); // limit
        break;
      }
      case 'update-progress': {
        if (key && typeof value === 'number') {
          lib.progress[key] = value;
        }
        break;
      }
      case 'update-continue-watching': {
        const idx = lib.continueWatching.findIndex(
          (c: { id: number; mediaType: string; season?: number; episode?: number }) => {
            if (c.id !== item.id || c.mediaType !== item.mediaType) return false;
            if (item.mediaType === 'tv') {
              return c.season === item.season && c.episode === item.episode;
            }
            return true;
          }
        );
        if (idx >= 0) {
          lib.continueWatching[idx] = { ...item, updatedAt: new Date() };
        } else {
          lib.continueWatching.unshift({ ...item, updatedAt: new Date() });
        }
        lib.continueWatching = lib.continueWatching.slice(0, 20);
        break;
      }
      case 'remove-history': {
        lib.history = lib.history.filter((h: { id: number; mediaType: string; season?: number; episode?: number }) => {
          if (h.id !== item.id || h.mediaType !== item.mediaType) return true;
          if (item.mediaType === 'tv') {
            return !(h.season === item.season && h.episode === item.episode);
          }
          return false;
        });
        break;
      }
      case 'update-settings': {
        if (item) lib.settings = { ...lib.settings, ...item };
        break;
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await lib.save();
    return NextResponse.json(lib);
  } catch (error) {
    console.error('Library POST error:', error);
    return NextResponse.json({ error: 'Failed to update library' }, { status: 500 });
  }
}
