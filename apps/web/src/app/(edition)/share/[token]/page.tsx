import { renderEditionRoute, type EditionPageProps } from '../../edition-route';

export default function SharePage(props: EditionPageProps) {
  return renderEditionRoute('share', props);
}
