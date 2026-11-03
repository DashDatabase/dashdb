// The edition this build was made with. Import it from here, never from '@dashdb/active-edition'
// directly, so it is checked once against the edition API.
import activeEdition from '@dashdb/active-edition';
import { assertEditionModule, type EditionModule } from '@dashdb/edition';

const loaded: unknown = activeEdition;
assertEditionModule(loaded);

export const edition: EditionModule = loaded;
