import { renderEditionRoute, type EditionPageProps } from '../../edition-route';

export default function SettingsPage(props: EditionPageProps) {
  return renderEditionRoute('settings', props);
}
