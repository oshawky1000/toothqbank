import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// Shows a friendly message instead of a blank page if something breaks.
// The most common case: the site was updated while a student had it open, and
// the old page tries to load a file that no longer exists. Reloading fixes it.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    const isUpdate = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(
      this.state.error.message,
    )
    return (
      <section className="card notice" role="alert">
        <h2>{isUpdate ? 'ToothQBank was updated' : 'Something went wrong'}</h2>
        <p>
          {isUpdate
            ? 'Reload the page to get the latest version.'
            : 'Reload the page and try again. If it keeps happening, check your internet connection.'}
        </p>
        <button type="button" className="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    )
  }
}
