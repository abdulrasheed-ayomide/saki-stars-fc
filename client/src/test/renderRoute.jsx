import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/routes.jsx';
import { AppProviders } from '../app/AppProviders.jsx';

export function renderRoute(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return {
    router,
    ...render(
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>,
    ),
  };
}
