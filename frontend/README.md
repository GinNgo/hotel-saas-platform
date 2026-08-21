# Frontend

LuxeStay frontend is an Angular standalone application for public booking, customer checkout and hotel operations.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test -- --watch=false
```

## Running end-to-end tests

Install the Playwright browser runtime once:

```bash
npx playwright install chromium
```

Run the self-contained acceptance suite, which starts Angular and mocks its required APIs:

```bash
npm run e2e:smoke
```

Run the complete integration suite only when the backend and seeded test accounts are available:

```bash
npm run e2e:integration
```

Set `LUXESTAY_E2E_WEB_URL` to use a different frontend port and `LUXESTAY_E2E_API_URL` when targeting a non-default backend environment.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
