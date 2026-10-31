import { formatDate } from '@/lib/content-pages';
import type { BlogPost } from '@/lib/source';

/** Date, author, reading time and tags, above a post's title. */
export function PostMeta({ post }: { post: BlogPost }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-muted">
      <time dateTime={post.date}>{formatDate(post.date)}</time>
      <span aria-hidden="true">·</span>
      <span>{post.author.name}</span>
      <span aria-hidden="true">·</span>
      <span>{post.readingMinutes} min read</span>
      <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
        {post.tags.map((tag) => (
          <li key={tag} className="rounded-full border px-2 py-0.5 text-xs">
            {tag}
          </li>
        ))}
      </ul>
    </div>
  );
}
