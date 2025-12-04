import axios from "axios";
 
export const api = axios.create({
  baseURL: process.env.API_BASE || "http://localhost:3000/api/v1",
  timeout: 10000,
});



 