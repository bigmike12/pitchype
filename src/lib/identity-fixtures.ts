// Test fixtures: Dojah's documented sample kyc_widget event (docs.dojah.io,
// "Webhooks & signatures"), with the sandbox NIN/BVN test values, plus the
// variants the decision tests need. Used by tests only.

export const SAMPLE_NIN = "70123456789";
export const SAMPLE_BVN = "22222222222";

type Json = Record<string, unknown>;

/** A fresh copy of the sample, so a test can change it freely. */
export function widgetEvent(
  idType: "NIN" | "BVN" = "NIN",
  verificationStatus = "Completed",
): Json {
  const number = idType === "NIN" ? SAMPLE_NIN : SAMPLE_BVN;
  const key = idType.toLowerCase();
  return {
    metadata: {
      ipinfo: {
        status: "success",
        country: "Nigeria",
        city: "Lagos",
        isp: "Mtn Nigeria Communication Limited",
        query: "203.0.113.43",
      },
      device_info: "",
    },
    data: {
      index: {
        data: {},
        message: "Successfully continued to the main checks.",
        status: true,
      },
      user_data: {
        data: {
          first_name: "John",
          last_name: "Doe",
          dob: "1990-01-01",
          email: null,
        },
        message: "",
        status: true,
      },
      government_data: {
        data: {
          [key]: {
            entity: {
              [key]: number,
              first_name: "JOHN",
              last_name: "DOE",
              middle_name: "EMEKA",
              gender: "Male",
              date_of_birth: "1992-10-10",
              phone_number: "08012345678",
              image_url: "https://images.dojah.io/id_John_Doe_1720615487.jpg",
            },
          },
        },
        message: "",
        status: true,
      },
      phone_number: {
        data: { phone: "2348000000000" },
        message: "2348000000000 validation Collected",
        status: true,
      },
      selfie: {
        data: {
          selfie_url:
            "https://files.dojah.io/dojah-images/selfie_sample_image_1720624219.jpg?X-Amz-Expires=3600&X-Amz-Signature=abc",
          liveness_score: null,
          match_score: null,
        },
        message: "Successfully validated your liveness",
        status: true,
      },
    },
    id_type: idType,
    value: number,
    id_url: "https://files.dojah.io/dojah-images/id_sample_id_1720624047.jpg",
    signature: "https://files.dojah.io/1787155022412-14300.pdf",
    message: "Successfully completed the verification.",
    verification_pdf: "https://files.dojah.io/dojah-files/report.pdf",
    reference_id: "pit_id_0123456789abcdef0123456789abcdef",
    widget_id: "6a551c4bd6d8a5b39c456c0a",
    verification_mode: "LIVENESS",
    verification_url:
      "https://app.dojah.io/easy-onboard/verifications/981835b4-8f7d-43d5-9321-53fe4d694eb0",
    selfie_url: "https://files.dojah.io/dojah-images/selfie_sample.jpg",
    status: true,
    aml: { status: false },
    verification_status: verificationStatus,
  };
}
