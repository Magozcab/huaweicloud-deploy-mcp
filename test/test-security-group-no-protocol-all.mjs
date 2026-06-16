import assert from "node:assert";
import { generateTerraform } from "../terraform-generator.mjs";

console.log("Test: security group rules must not generate protocol all");

const architecture = {
  architecture_id: "sg-protocol-test",
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
      rules: [
        {
          direction: "egress",
          protocol: "all",
          remote_ip_prefix: "0.0.0.0/0"
        },
        {
          direction: "ingress",
          protocol: "tcp",
          port: 3306,
          remote_ip_prefix: "10.80.0.0/16"
        }
      ]
    }
  ]
};

const files = generateTerraform(architecture);
const mainTf = files["main.tf"];

assert(!mainTf.includes('protocol          = "all"'), "main.tf must not contain protocol all");
assert(!mainTf.includes('protocol = "all"'), "main.tf must not contain compact protocol all");
assert(mainTf.includes('protocol          = "tcp"'), "main.tf must still generate valid tcp rules");

console.log("PASS: protocol all is not generated");
