const { seedAllData } = require("../services/seedData");

async function main() {
  try {
    console.log("Seeding data to Firebase...");
    const success = await seedAllData();
    if (success) {
      console.log("Data seeded successfully!");
    } else {
      console.error("Failed to seed data");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
}

main();