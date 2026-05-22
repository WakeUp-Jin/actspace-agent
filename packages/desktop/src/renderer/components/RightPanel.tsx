export function RightPanel() {
  return (
    <aside className="right-panel">
      <div className="right-tabs">
        <button className="is-active" type="button">README.md</button>
        <button type="button">Session diff</button>
      </div>
      <div className="right-panel-body">
        <h2>Markdown preview</h2>
        <p>Right panel preview will render Markdown, HTML, images, and session-level diffs.</p>
      </div>
    </aside>
  );
}
