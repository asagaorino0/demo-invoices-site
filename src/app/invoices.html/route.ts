import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function GET(): Promise<Response> {
  const filePath = path.join(process.cwd(), 'invoices.html');
  const html = await readFile(filePath, 'utf8');

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8'
    }
  });
}
