import assert from "node:assert";
import { generateTerraform } from "../terraform-generator.mjs";

console.log("Test: architecture-level availability_zone is configurable");

const architecture = {
  architecture_id: "az-param-test",
  region: "la-south-2",
  availability_zone: "la-south-2a",
  deployment_mode: "terraform",
  components: [
    {
      service: "vpc",
      name: "test-vpc",
      cidr: "10.80.0.0/16"
    },
    {
      service: "subnet",
      name: "test-subnet",
      cidr: "10.80.1.0/24",
      gateway_ip: "10.80.1.1"
    },
    {
      service: "security_group",
      name: "test-sg",
      rules: []
    },
    {
      service: "rds_mysql",
      name: "test-mysql",
      engine: "MySQL",
      engine_version: "8.0",
      flavor: "rds.mysql.n1.large.1",
      storage_type: "ULTRAHIGH",
      storage_gb: 40,
      db_port: 3306,
      database_name: "testdb",
      username: "root"
    }
  ]
};

const files = generateTerraform(architecture);

assert(
  files["variables.tf"].includes('default     = "la-south-2a"'),
  "variables.tf must use architecture.availability_zone"
);

assert(
  !files["variables.tf"].includes('default     = "la-north-2a"'),
  "variables.tf must not hardcode la-north-2a"
);

console.log("PASS: architecture-level availability_zone is configurable");
