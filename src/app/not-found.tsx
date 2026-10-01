import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <div className="skyspace" />
      <section className="panel">
        <span className="eyebrow">404</span>
        <h1 className="display">Nothing down here.</h1>
        <p className="note">That page doesn&apos;t exist, or the game isn&apos;t out yet.</p>
        <div className="row"><Link href="/" className="go">Back to the arcade</Link></div>
      </section>
    </>
  );
}
