export default function Hero() {
  return (
    <section className="bg-gradient-to-b from-[#f7f9fc] to-white">
      <div className="max-w-5xl mx-auto px-6 pt-24 pb-16 text-center">

        <span className="inline-block mb-6 px-5 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
          Secure & Centralized ERP Platform
        </span>

        <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 leading-tight">
          Manage Certificates, <br />
          Courses & Students with <br />
          <span className="inline-block mt-4 px-6 py-2 rounded-full bg-[#062a4d] text-white">
            One ERP System
          </span>
        </h1>

        <p className="mt-8 text-lg text-gray-600 max-w-3xl mx-auto">
          A centralized ERP platform to manage student certifications,
          course progress, academic records, and examinations efficiently
          across colleges and departments.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <button className="bg-[#062a4d] text-white px-8 py-3 rounded-lg font-semibold transition">
            Get Started
          </button>
          <button className="border border-gray-300 px-8 py-3 rounded-lg font-semibold transition">
            Learn More
          </button>
        </div>
      </div>
    </section>
  );
}