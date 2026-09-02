import { NextRequest, NextResponse } from 'next/server';
import { GAMES, getGamesByCategory, getPopularGames, searchGames, type GameCategory } from '@/app/lib/game-catalog';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const category = searchParams.get('category') as GameCategory | null;
    const gameId = searchParams.get('gameId');
    const packageId = searchParams.get('packageId');

    // Get single game
    if (gameId) {
      const game = GAMES.find(g => g.id === gameId && g.active);
      if (!game) {
        return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
      }

      // Get specific package
      if (packageId) {
        const pkg = game.packages.find(p => p.id === packageId);
        if (!pkg) {
          return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true, data: { game, package: pkg } });
      }

      return NextResponse.json({ success: true, data: { game } });
    }

    // Search games
    if (search) {
      const games = searchGames(search);
      return NextResponse.json({ success: true, data: { games, total: games.length } });
    }

    // Filter by category
    if (category) {
      const games = getGamesByCategory(category);
      return NextResponse.json({ success: true, data: { games, total: games.length } });
    }

    // Get all active games
    const activeGames = GAMES.filter(g => g.active);
    const popular = getPopularGames();

    return NextResponse.json({
      success: true,
      data: {
        games: activeGames,
        popular,
        total: activeGames.length,
        categories: ['Mobile', 'PC', 'Gift Cards'],
      },
    });
  } catch (error) {
    console.error('Games API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch games' }, { status: 500 });
  }
}
