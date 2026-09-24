import { SearchX } from 'lucide-react';
import { StatusMessage } from '../components/feedback/StatusMessage.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <StatusMessage icon={SearchX} eyebrow="Error 404" title="Page not found">
      <p>The page you are looking for does not exist or has been moved.</p>
    </StatusMessage>
  );
}
