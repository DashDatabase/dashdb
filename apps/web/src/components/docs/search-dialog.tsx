'use client';

import { useStaticSearch } from 'fumadocs-core/search/client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search';

/** Where the build writes the exported search index (see app/api/search/route.ts). */
const SEARCH_INDEX_URL = '/api/search';

/**
 * Docs search that runs in the browser: the static index is downloaded once, on first use, and
 * every query is answered locally, so searching never reaches a server.
 */
export default function DocsSearchDialog(props: SharedProps) {
  const search = useStaticSearch({ from: SEARCH_INDEX_URL });
  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
      </SearchDialogContent>
    </SearchDialog>
  );
}
