import { renderEditionRoute, type EditionPageProps } from '../edition-route';

export default function VerifyPage(props: EditionPageProps) {
  return renderEditionRoute('verify', props);
}
