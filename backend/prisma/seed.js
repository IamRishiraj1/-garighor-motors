require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const SEED_CARS = [
  { stockNo: "GGM-1042", brand: "Toyota", model: "Axio Hybrid", year: 2018, regYear: 2019, price: 1685000, mileage: 62000, fuel: "Hybrid", transmission: "CVT", engineCC: 1500, color: "Pearl White", condition: "Excellent", bodyType: "Sedan", auctionGrade: "4.5 / B", status: "available", featured: true, image: "", desc: "A crisp, fuel-sipping sedan pulled from a single-owner Japanese auction lot. Full service history, non-smoking cabin, and the hybrid battery health-checked at import.", features: ["Alloy Wheels", "Reverse Camera", "Push Start", "Keyless Entry", "Auto AC"] },
  { stockNo: "GGM-1043", brand: "Honda", model: "Vezel Z", year: 2019, regYear: 2020, price: 2450000, mileage: 41000, fuel: "Hybrid", transmission: "CVT", engineCC: 1500, color: "Premium Crystal Red", condition: "Excellent", bodyType: "Crossover", auctionGrade: "4.5 / A", status: "available", featured: true, image: "", desc: "The Vezel that gets flagged first at every showroom viewing. Low mileage, panoramic sunroof, and the honeycomb grille trim in showroom condition.", features: ["Sunroof", "Cruise Control", "LED Headlamps", "Paddle Shift", "Rear Sensors"] },
  { stockNo: "GGM-1044", brand: "Nissan", model: "X-Trail", year: 2017, regYear: 2018, price: 2190000, mileage: 78000, fuel: "Petrol", transmission: "CVT", engineCC: 2000, color: "Brilliant Silver", condition: "Very Good", bodyType: "SUV", auctionGrade: "4.0 / B", status: "reserved", featured: false, image: "", desc: "Family-ready 7-seat SUV with third-row seating, ideal for weekend trips out of the city. Recent tyre replacement and full brake service.", features: ["7 Seater", "360 Camera", "Roof Rails", "Auto AC", "Cruise Control"] },
  { stockNo: "GGM-1045", brand: "Suzuki", model: "Swift RS", year: 2020, regYear: 2020, price: 1420000, mileage: 28000, fuel: "Petrol", transmission: "CVT", engineCC: 1200, color: "Champion Yellow", condition: "Excellent", bodyType: "Hatchback", auctionGrade: "4.5 / A", status: "available", featured: true, image: "", desc: "Nearly new, city-friendly hatchback with the lowest mileage in our current lot. First owner, dealer-maintained since day one.", features: ["Keyless Entry", "Reverse Camera", "Alloy Wheels", "Steering Audio Controls"] },
  { stockNo: "GGM-1046", brand: "Mitsubishi", model: "Outlander PHEV", year: 2018, regYear: 2019, price: 2850000, mileage: 55000, fuel: "Hybrid", transmission: "Automatic", engineCC: 2000, color: "Titanium Grey", condition: "Very Good", bodyType: "SUV", auctionGrade: "4.0 / B", status: "available", featured: false, image: "", desc: "Plug-in hybrid SUV with real electric-only range for short commutes and full power in reserve for highway trips.", features: ["Plug-in Hybrid", "4WD", "Leather Seats", "Heated Seats", "Navigation"] },
  { stockNo: "GGM-1047", brand: "Toyota", model: "Premio F EX", year: 2016, regYear: 2017, price: 1590000, mileage: 91000, fuel: "Petrol", transmission: "Automatic", engineCC: 1500, color: "Attitude Black", condition: "Good", bodyType: "Sedan", auctionGrade: "3.5 / B", status: "available", featured: false, image: "", desc: "The dependable choice for daily driving and hire-car duty alike. Engine and gearbox compression-tested before listing.", features: ["Auto AC", "Power Windows", "Fog Lamps", "Central Lock"] },
  { stockNo: "GGM-1048", brand: "Hyundai", model: "Tucson GLS", year: 2019, regYear: 2020, price: 2980000, mileage: 37000, fuel: "Petrol", transmission: "Automatic", engineCC: 2000, color: "Phantom Black", condition: "Excellent", bodyType: "SUV", auctionGrade: "4.5 / A", status: "available", featured: true, image: "", desc: "Bold, well-equipped mid-size SUV with a cabin that still smells new. Comes with the balance of its manufacturer warranty documentation.", features: ["Leather Seats", "Sunroof", "Rear Camera", "Cruise Control", "Alloy Wheels"] },
  { stockNo: "GGM-1049", brand: "Honda", model: "Fit Hybrid", year: 2019, regYear: 2019, price: 1350000, mileage: 33000, fuel: "Hybrid", transmission: "CVT", engineCC: 1500, color: "Taffeta White", condition: "Excellent", bodyType: "Hatchback", auctionGrade: "4.5 / B", status: "sold", featured: false, image: "", desc: "Compact, frugal and easy to park - a favourite among first-time buyers. Sold with a clean auction sheet and no accident history.", features: ["Auto AC", "Reverse Camera", "Push Start", "Multi-info Display"] },
  { stockNo: "GGM-1050", brand: "Mazda", model: "CX-5", year: 2018, regYear: 2019, price: 2670000, mileage: 48000, fuel: "Petrol", transmission: "Automatic", engineCC: 2000, color: "Soul Red Crystal", condition: "Very Good", bodyType: "SUV", auctionGrade: "4.0 / A", status: "available", featured: false, image: "", desc: "Driver-focused SUV with the sharpest handling in its class locally. Interior trim and seats show minimal wear.", features: ["Leather Seats", "Bose Audio", "Heads-up Display", "Blind Spot Monitor"] },
  { stockNo: "GGM-1051", brand: "Toyota", model: "Prius Alpha", year: 2017, regYear: 2018, price: 1980000, mileage: 66000, fuel: "Hybrid", transmission: "CVT", engineCC: 1800, color: "Silver Metallic", condition: "Good", bodyType: "Wagon", auctionGrade: "4.0 / B", status: "available", featured: false, image: "", desc: "7-seat hybrid wagon that quietly delivers exceptional mileage figures. Popular choice for ride-share and family use alike.", features: ["7 Seater", "Auto AC", "Reverse Camera", "Cruise Control"] },
];

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Showroom Owner";

  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin user creation.");
  } else {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.create({ data: { name, email, passwordHash, role: "admin" } });
      console.log(`Admin account created: ${email}`);
    } else {
      console.log(`Admin account already exists: ${email}`);
    }
  }

  for (const car of SEED_CARS) {
    const existing = await prisma.car.findUnique({ where: { stockNo: car.stockNo } });
    if (!existing) {
      await prisma.car.create({ data: car });
    }
  }
  console.log(`Seeded ${SEED_CARS.length} sample cars (skipped any that already existed).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
