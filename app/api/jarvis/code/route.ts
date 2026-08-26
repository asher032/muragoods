import { NextResponse } from 'next/server';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { analyzeCode, generateCodeChange } from '@/lib/jarvis-gemini';

// Admin-only endpoint for code editing
const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

function isAdmin(email?: string): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}

// ─── GET: Read file or list directory ────────────────────────
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const filePath = url.searchParams.get('path');
    const action = url.searchParams.get('action') || 'read';

    if (!isAdmin(email ?? undefined)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    const rootDir = process.cwd();

    if (action === 'list' || !filePath) {
      // List directory
      const dir = filePath ? join(rootDir, filePath) : rootDir;
      const entries = await readdir(dir, { withFileTypes: true });
      const items = await Promise.all(
        entries
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.next')
          .slice(0, 50)
          .map(async e => {
            const fullPath = join(dir, e.name);
            const relPath = relative(rootDir, fullPath);
            const s = await stat(fullPath).catch(() => null);
            return {
              name: e.name,
              path: relPath,
              isDirectory: e.isDirectory(),
              size: s?.size || 0,
              modified: s?.mtime?.toISOString() || '',
            };
          })
      );
      return NextResponse.json({ success: true, data: items });
    }

    if (action === 'read') {
      // Read file content
      const fullPath = join(rootDir, filePath);
      // Safety: only allow reading project files
      if (filePath.includes('node_modules') || filePath.includes('.next') || filePath.includes('.git')) {
        return NextResponse.json({ success: false, error: 'Cannot read this file' }, { status: 400 });
      }
      const content = await readFile(fullPath, 'utf-8').catch(() => null);
      if (content === null) {
        return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: { path: filePath, content, lines: content.split('\n').length },
      });
    }

    if (action === 'analyze') {
      const fullPath = join(rootDir, filePath);
      const content = await readFile(fullPath, 'utf-8').catch(() => null);
      if (!content) {
        return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
      }
      const question = url.searchParams.get('question') || 'Analyze this code for bugs, improvements, and best practices.';
      const analysis = await analyzeCode(content, question);
      return NextResponse.json({ success: true, data: { path: filePath, analysis } });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Code read error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── POST: Edit file with AI-generated code ──────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      filePath: string;
      instruction: string;
      currentContent?: string;
    };

    if (!isAdmin(body.email)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    if (!body.filePath || !body.instruction) {
      return NextResponse.json({ success: false, error: 'File path and instruction required' }, { status: 400 });
    }

    const rootDir = process.cwd();
    const fullPath = join(rootDir, body.filePath);

    // Safety checks
    if (body.filePath.includes('node_modules') || body.filePath.includes('.next') || body.filePath.includes('.git')) {
      return NextResponse.json({ success: false, error: 'Cannot modify this file' }, { status: 400 });
    }

    // Read current content if not provided
    const currentContent = body.currentContent || await readFile(fullPath, 'utf-8').catch(() => '');

    if (!currentContent && !body.currentContent) {
      return NextResponse.json({ success: false, error: 'File not found or empty' }, { status: 404 });
    }

    // Use Gemini to generate the code change
    const result = await generateCodeChange(currentContent, body.instruction, body.filePath);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.explanation }, { status: 500 });
    }

    // Write the new content
    await writeFile(fullPath, result.newCode!, 'utf-8');

    return NextResponse.json({
      success: true,
      data: {
        path: body.filePath,
        instruction: body.instruction,
        explanation: result.explanation,
        linesChanged: result.newCode!.split('\n').length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Code edit error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
