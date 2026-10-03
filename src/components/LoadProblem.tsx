// Shown when something could not be loaded (usually no internet).
export default function LoadProblem({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="banner banner-warning" role="alert">
      <p>We could not load {what}. Check your internet connection.</p>
      <div className="banner-actions">
        <button type="button" className="link-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  )
}
