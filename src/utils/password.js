import bcrypt from "bcrypt";


const hash = await bcrypt.hash("Employee@111", 10);
console.log(hash);
