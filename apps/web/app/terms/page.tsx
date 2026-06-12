import { Header, SiteTopbar } from "@/components";

export default function Terms() {
  return (
    <>
      <SiteTopbar />
      <Header title="Terms" subtitle="Demo-сторінка (заглушка)" />
      <div className="card" style={{ lineHeight: 1.55, fontWeight: 800 }}>
        Тут будуть умови користування. Step 10 фіксує каркас продакшн-структури сайту (каталог, доставка,
        checkout, policy pages).
      </div>
    </>
  );
}
