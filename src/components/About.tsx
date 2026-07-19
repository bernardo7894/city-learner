export function About({ onExit }: { onExit: () => void }) {
  return (
    <main className="about-page">
      <header className="page-header"><button className="back-button" onClick={onExit}>← Overview</button><div><p className="eyebrow">About the atlas</p><h1>Data & learning model</h1></div></header>
      <div className="about-grid">
        <section className="panel"><h2>A tutor under the map</h2><p>Atlas Recall stores two independent memories per city: naming a marked location and locating a shown name. Reviews use exponential retrievability and deterministic intervals. Fast, accurate answers grow stability; lapses trigger a ten-minute relearning step.</p><p>Three correct recent reviews in both directions and at least 30 days of stability are required for mastery. Mastered items leave normal queues until their maintenance date.</p></section>
        <section className="panel"><h2>City identities</h2><p>The 324-item user curriculum remains authoritative. Coordinates, country, administrative region, population metadata, canonical spellings, and stable IDs are enriched from the GeoNames downloadable dump at build time.</p><p>Ambiguous labels and duplicate Hyderabad/San Jose entries are country-qualified through explicit manual overrides. Every candidate decision is recorded in <code>data/enrichment-report.json</code>.</p></section>
        <section className="panel"><h2>Map data</h2><p>Country boundaries are derived from Natural Earth through the locally bundled world-atlas topology. The app makes no tile-server or map-API request during play.</p><p>Population is used only for a broad introduction priority. It does not determine what you must review.</p></section>
        <section className="panel"><h2>Attribution</h2><p>GeoNames data is licensed under Creative Commons Attribution 4.0. Natural Earth data is public domain. The world-atlas conversion is distributed under ISC.</p><p>Full source links, versions, and known uncertainties are documented in <code>ATTRIBUTION.md</code> and the project README.</p></section>
      </div>
    </main>
  )
}
