import { renderEditionRoute, type EditionPageProps } from '../edition-route';

export default function BillingPage(props: EditionPageProps) {
  return renderEditionRoute('billing', props);
}
